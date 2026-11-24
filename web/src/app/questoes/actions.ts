"use server";

import { del, put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";

import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxImageSize = 1_048_576;
const maxImagesPerQuestion = 3;
const imageFormats = {
  "image/jpeg": { extension: "jpg", signature: (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/png": { extension: "png", signature: (bytes: Uint8Array) => bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a },
  "image/webp": { extension: "webp", signature: (bytes: Uint8Array) => bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" },
} as const;

type ReturnParams = {
  periodId?: string;
  disciplineId?: string;
  contentId?: string;
  questionTypeId?: string;
  editQuestionId?: string;
  page?: string;
};

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function textAreaField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

async function finish(
  params: ReturnParams,
  kind: "notice" | "error",
  message: string,
): Promise<never> {
  const query = new URLSearchParams();
  for (const key of ["periodId", "disciplineId", "contentId", "questionTypeId", "editQuestionId"] as const) {
    const value = params[key];
    if (value && uuidPattern.test(value)) query.set(key, value);
  }
  if (params.page && /^[1-9]\d{0,4}$/.test(params.page)) query.set("page", params.page);
  query.set(kind, message);
  revalidatePath("/questoes");
  redirect(`/questoes?${query.toString()}`);
}

export async function saveQuestion(formData: FormData) {
  await requireUser();

  const questionTypeId = field(formData, "questionTypeId");
  const questionId = field(formData, "questionId");
  const statement = textAreaField(formData, "statement");
  const explanation = textAreaField(formData, "explanation");
  const imageAltText = textAreaField(formData, "imageAltText").trim().slice(0, 300);
  const uploadedFiles = formData.getAll("questionImages").filter(
    (entry): entry is File => entry instanceof File && entry.size > 0,
  );
  const removeImageIds = formData.getAll("removeImageIds").map(String).filter((id) => uuidPattern.test(id));
  const difficulty = field(formData, "difficulty");
  const correctOption = Number(field(formData, "correctOption"));
  const params: ReturnParams = {
    periodId: field(formData, "periodId"),
    disciplineId: field(formData, "disciplineId"),
    contentId: field(formData, "contentId"),
    questionTypeId,
    editQuestionId: questionId,
    page: field(formData, "page"),
  };

  if (!uuidPattern.test(params.periodId ?? "") || !uuidPattern.test(params.disciplineId ?? "") ||
      !uuidPattern.test(params.contentId ?? "") || !uuidPattern.test(questionTypeId) ||
      (questionId && !uuidPattern.test(questionId))) {
    await finish({}, "error", "Selecione uma questão e um tipo válidos.");
  }
  if (!statement.trim() || statement.length > 20_000 || explanation.length > 10_000) {
    await finish(params, "error", "Informe o enunciado (até 20.000 caracteres); a explicação pode ter até 10.000.");
  }
  if (uploadedFiles.length > maxImagesPerQuestion || (removeImageIds.length && !questionId)) {
    await finish(params, "error", "Anexe até 3 imagens por vez e remova imagens apenas ao editar uma questão.");
  }
  const validatedImages: { file: File; type: keyof typeof imageFormats; extension: string }[] = [];
  for (const file of uploadedFiles) {
    if (file.size > maxImageSize) {
      await finish(params, "error", "Cada imagem deve ter no máximo 1 MB.");
    }
    const format = imageFormats[file.type as keyof typeof imageFormats];
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!format || !format.signature(bytes)) {
      await finish(params, "error", "Use imagens JPEG, PNG ou WebP válidas.");
    }
    validatedImages.push({ file, type: file.type as keyof typeof imageFormats, extension: format.extension });
  }
  if (
    validatedImages.length &&
    !process.env.BLOB_READ_WRITE_TOKEN &&
    !(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)
  ) {
    await finish(params, "error", "Conecte um Blob privado da Vercel antes de anexar imagens.");
  }
  if (!["easy", "medium", "hard"].includes(difficulty)) {
    await finish(params, "error", "Selecione o nível de dificuldade.");
  }

  const pool = getDatabase();
  const typeResult = await pool.query<{ alternatives_count: number }>(
    `select qt.alternatives_count
     from public.question_types qt
     join public.contents c on c.id = qt.content_id
     join public.term_disciplines td on td.discipline_id = c.discipline_id
     where qt.id = $1 and c.id = $2 and c.discipline_id = $3 and td.term_id = $4`,
    [questionTypeId, params.contentId, params.disciplineId, params.periodId],
  );
  const questionType = typeResult.rows[0];
  if (!questionType) {
    await finish({}, "error", "Este tipo de questão não existe mais. Atualize a página.");
  }

  const alternativesCount = Number(questionType.alternatives_count);
  const alternatives = Array.from({ length: alternativesCount }, (_, index) => ({
    number: index + 1,
    text: textAreaField(formData, `alternative${index + 1}`),
  }));
  if (alternatives.some((alternative) => !alternative.text.trim() || alternative.text.length > 5_000)) {
    await finish(params, "error", "Preencha todas as alternativas (até 5.000 caracteres cada).");
  }
  if (!Number.isInteger(correctOption) || correctOption < 1 || correctOption > alternativesCount) {
    await finish(params, "error", "Marque uma alternativa correta.");
  }

  const client = await pool.connect();
  let saved = false;
  let missingQuestion = false;
  let imageLimitExceeded = false;
  const uploadedBlobPaths: string[] = [];
  const removedBlobPaths: string[] = [];
  try {
    await client.query("begin");
    let savedQuestionId = questionId;

    if (questionId) {
      const updated = await client.query<{ id: string }>(
        `update public.questions
         set statement = $2::jsonb, explanation = $3, difficulty = $4
         where id = $1 and question_type_id = $5
         returning id`,
        [questionId, JSON.stringify([{ type: "text", text: statement }]), explanation.trim() ? explanation : null, difficulty, questionTypeId],
      );
      savedQuestionId = updated.rows[0]?.id ?? "";
      if (savedQuestionId) {
        await client.query("delete from public.question_options where question_id = $1", [savedQuestionId]);
        const existingResult = await client.query<{ id: string; blob_pathname: string; sort_order: number }>(
          "select id, blob_pathname, sort_order from public.question_images where question_id = $1 order by sort_order",
          [savedQuestionId],
        );
        const requestedRemovals = new Set(removeImageIds);
        for (const image of existingResult.rows) {
          if (requestedRemovals.has(image.id)) removedBlobPaths.push(image.blob_pathname);
        }
        const remaining = existingResult.rows.filter((image) => !requestedRemovals.has(image.id));
        if (remaining.length + validatedImages.length > maxImagesPerQuestion) {
          imageLimitExceeded = true;
        } else if (requestedRemovals.size !== removedBlobPaths.length) {
          missingQuestion = true;
        } else {
          await client.query("delete from public.question_images where id = any($1::uuid[])", [removeImageIds]);
          if (remaining.length) {
            for (const [index, image] of remaining.entries()) {
              await client.query("update public.question_images set sort_order = $2 where id = $1", [image.id, index]);
            }
          }
        }
      } else {
        missingQuestion = true;
      }
    } else {
      const inserted = await client.query<{ id: string }>(
        `insert into public.questions (question_type_id, statement, explanation, difficulty)
         values ($1, $2::jsonb, $3, $4)
         returning id`,
        [questionTypeId, JSON.stringify([{ type: "text", text: statement }]), explanation.trim() ? explanation : null, difficulty],
      );
      savedQuestionId = inserted.rows[0].id;
    }

    if (!missingQuestion && !imageLimitExceeded) {
      for (const alternative of alternatives) {
        await client.query(
          `insert into public.question_options (question_id, option_number, content, is_correct)
           values ($1, $2, $3::jsonb, $4)`,
          [
            savedQuestionId,
            alternative.number,
            JSON.stringify([{ type: "text", text: alternative.text }]),
            alternative.number === correctOption,
          ],
        );
      }
      const imageCountResult = await client.query<{ count: number }>(
        "select count(*)::int as count from public.question_images where question_id = $1",
        [savedQuestionId],
      );
      let sortOrder = Number(imageCountResult.rows[0]?.count ?? 0);
      for (const image of validatedImages) {
        const blob = await put(`questions/${savedQuestionId}/${randomUUID()}.${image.extension}`, image.file, {
          access: "private",
          contentType: image.type,
          addRandomSuffix: true,
        });
        uploadedBlobPaths.push(blob.pathname);
        await client.query(
          `insert into public.question_images (question_id, blob_pathname, content_type, file_size, alt_text, sort_order)
           values ($1, $2, $3, $4, $5, $6)`,
          [savedQuestionId, blob.pathname, image.type, image.file.size, imageAltText, sortOrder++],
        );
      }
      await client.query("commit");
      saved = true;
    } else {
      await client.query("rollback");
    }
  } catch {
    await client.query("rollback").catch(() => undefined);
  } finally {
    client.release();
  }

  if (!saved && uploadedBlobPaths.length) {
    await del(uploadedBlobPaths).catch(() => undefined);
  }

  if (missingQuestion) {
    await finish({ ...params, editQuestionId: undefined }, "error", "A questão não foi encontrada neste tipo.");
  }
  if (imageLimitExceeded) {
    await finish(params, "error", "A questão pode ter no máximo 3 imagens. Remova alguma antes de anexar outra.");
  }
  if (!saved) {
    await finish(params, "error", "Não foi possível salvar a questão. Confira os dados e tente novamente.");
  }

  if (removedBlobPaths.length) await del(removedBlobPaths).catch(() => undefined);

  await finish(
    { ...params, editQuestionId: undefined, page: questionId ? params.page : "1" },
    "notice",
    questionId ? "Questão atualizada." : "Questão cadastrada no banco.",
  );
}
