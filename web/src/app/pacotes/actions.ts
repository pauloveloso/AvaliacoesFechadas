"use server";

import { copy, del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const labels = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

type Slot = { position: number; typeId: string; difficulty: string; points: string };
type Candidate = {
  id: string;
  statement: unknown;
  explanation: string | null;
  difficulty: "easy" | "medium" | "hard";
  alternatives: { number: number; text: string; is_correct: boolean }[];
  images: { blob_pathname: string; content_type: string; alt_text: string }[];
};

function getField(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function versionLabel(number: number) {
  let value = number;
  let label = "";
  while (value > 0) {
    value--;
    label = labels[value % labels.length] + label;
    value = Math.floor(value / labels.length);
  }
  return label;
}

function getPoints(value: string) {
  const normalized = value.replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return null;
  const points = Number(normalized);
  return Number.isFinite(points) && points > 0 && points <= 100 ? points : null;
}

function redirectWithError(params: { periodId: string; disciplineId: string; contentId: string }, error: string): never {
  const query = new URLSearchParams({ ...params, error });
  redirect(`/pacotes?${query.toString()}`);
}

export async function createExamPackage(formData: FormData) {
  await requireUser();

  const periodId = getField(formData, "periodId");
  const disciplineId = getField(formData, "disciplineId");
  const contentId = getField(formData, "contentId");
  const title = getField(formData, "title").slice(0, 120);
  const campusName = getField(formData, "campusName").slice(0, 180);
  const instructions = getField(formData, "instructions").slice(0, 500);
  const versionCount = Number(getField(formData, "versionCount"));
  const questionCount = Number(getField(formData, "questionCount"));
  const pageParams = { periodId, disciplineId, contentId };

  if (!uuidPattern.test(periodId) || !uuidPattern.test(disciplineId) || !uuidPattern.test(contentId)) {
    redirectWithError(pageParams, "Selecione período, disciplina e conteúdo válidos.");
  }
  if (!title || !campusName || !Number.isInteger(versionCount) || versionCount < 1 || versionCount > 30 ||
      !Number.isInteger(questionCount) || questionCount < 1 || questionCount > 10) {
    redirectWithError(pageParams, "Informe título e texto do campus, de 1 a 30 versões e de 1 a 10 questões.");
  }

  const slots: Slot[] = [];
  for (let position = 1; position <= questionCount; position++) {
    const typeId = getField(formData, `questionType${position}`);
    const difficulty = getField(formData, `difficulty${position}`);
    const points = getPoints(getField(formData, `points${position}`));
    if (!uuidPattern.test(typeId) || !["easy", "medium", "hard"].includes(difficulty) || points === null) {
      redirectWithError(pageParams, `Confira tipo, dificuldade e valor da questão ${position}.`);
    }
    slots.push({ position, typeId, difficulty, points: points.toFixed(2) });
  }

  const pool = getDatabase();
  const contextResult = await pool.query(
    `select c.id
     from public.contents c
     join public.disciplines d on d.id = c.discipline_id
     join public.term_disciplines td on td.discipline_id = d.id
     where c.id = $1 and d.id = $2 and td.term_id = $3`,
    [contentId, disciplineId, periodId],
  );
  if (!contextResult.rowCount) redirectWithError(pageParams, "Esse conteúdo não pertence à disciplina/período selecionado.");

  const typeIds = [...new Set(slots.map((slot) => slot.typeId))];
  const typesResult = await pool.query<{ id: string; name: string; alternatives_count: number }>(
    `select id, name, alternatives_count
     from public.question_types
     where id = any($1::uuid[]) and content_id = $2`,
    [typeIds, contentId],
  );
  const types = new Map(typesResult.rows.map((type) => [type.id, type]));
  if (types.size !== typeIds.length) redirectWithError(pageParams, "Cada tipo de questão deve pertencer ao conteúdo selecionado.");

  const candidatesBySlot = new Map<number, Candidate[]>();
  for (const slot of slots) {
    const candidatesResult = await pool.query<Candidate>(
      `select q.id, q.statement, q.explanation, q.difficulty,
              coalesce(o.alternatives, '[]'::json) as alternatives,
              coalesce(i.images, '[]'::json) as images
       from public.questions q
       join public.question_types qt on qt.id = q.question_type_id
       left join lateral (
         select json_agg(json_build_object(
           'number', option_number,
           'text', content #>> '{0,text}',
           'is_correct', is_correct
         ) order by option_number) as alternatives
         from public.question_options where question_id = q.id
       ) o on true
       left join lateral (
         select json_agg(json_build_object(
           'blob_pathname', blob_pathname,
           'content_type', content_type,
           'alt_text', alt_text
         ) order by sort_order) as images
         from public.question_images where question_id = q.id
       ) i on true
       where q.question_type_id = $1 and q.difficulty = $2 and q.is_active = true
       order by q.created_at desc, q.id desc`,
      [slot.typeId, slot.difficulty],
    );
    const type = types.get(slot.typeId)!;
    const candidates = candidatesResult.rows.filter((candidate) =>
      candidate.alternatives.length === Number(type.alternatives_count) &&
      candidate.alternatives.filter((alternative) => alternative.is_correct).length === 1,
    );
    if (!candidates.length) {
      redirectWithError(pageParams, `Não há questões válidas de dificuldade ${slot.difficulty} para a questão ${slot.position}.`);
    }
    candidatesBySlot.set(slot.position, candidates);
  }

  const client = await pool.connect();
  let packageId = "";
  let failedMessage = "Não foi possível criar o pacote. Confira os dados e tente novamente.";
  const copiedImagePaths: string[] = [];
  try {
    await client.query("begin");
    const totalPoints = slots.reduce((sum, slot) => sum + Number(slot.points), 0).toFixed(2);
    const packageResult = await client.query<{ id: string }>(
      `insert into public.exam_packages
        (term_id, discipline_id, content_id, title, version_count, question_count, total_points, instructions, campus_name)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [periodId, disciplineId, contentId, title, versionCount, questionCount, totalPoints, instructions, campusName],
    );
    packageId = packageResult.rows[0].id;

    for (const slot of slots) {
      await client.query(
        `insert into public.exam_package_slots (package_id, position, question_type_id, difficulty, points)
         values ($1, $2, $3, $4, $5)`,
        [packageId, slot.position, slot.typeId, slot.difficulty, slot.points],
      );
    }

    for (let versionIndex = 0; versionIndex < versionCount; versionIndex++) {
      const label = versionLabel(versionIndex + 1);
      const versionResult = await client.query<{ id: string }>(
        `insert into public.exam_versions (package_id, version_number, version_label)
         values ($1, $2, $3) returning id`,
        [packageId, versionIndex + 1, label],
      );
      const versionId = versionResult.rows[0].id;
      const usedPerType = new Map<string, number>();

      for (const slot of slots) {
        const candidates = candidatesBySlot.get(slot.position)!;
        const typeOffset = usedPerType.get(slot.typeId) ?? 0;
        const candidateIndex = (versionIndex + typeOffset) % candidates.length;
        usedPerType.set(slot.typeId, typeOffset + 1);
        const candidate = candidates[candidateIndex];
        const imagesSnapshot = [];

        for (const [imageIndex, image] of candidate.images.entries()) {
          if (!process.env.BLOB_READ_WRITE_TOKEN && !(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)) {
            failedMessage = "Este pacote contém imagens; conecte primeiro o Blob privado da Vercel.";
            throw new Error("blob-not-configured");
          }
          const extension = image.content_type === "image/jpeg" ? "jpg" : image.content_type === "image/png" ? "png" : "webp";
          const copied = await copy(
            image.blob_pathname,
            `packages/${packageId}/${versionId}/question-${slot.position}-${imageIndex + 1}.${extension}`,
            { access: "private", addRandomSuffix: true },
          );
          copiedImagePaths.push(copied.pathname);
          imagesSnapshot.push({ pathname: copied.pathname, content_type: image.content_type, alt_text: image.alt_text });
        }

        await client.query(
          `insert into public.exam_version_questions
            (version_id, position, question_id, question_type_name, difficulty, points,
             statement_snapshot, alternatives_snapshot, explanation_snapshot, images_snapshot)
           values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::jsonb)`,
          [
            versionId,
            slot.position,
            candidate.id,
            types.get(slot.typeId)!.name,
            candidate.difficulty,
            slot.points,
            JSON.stringify(candidate.statement),
            JSON.stringify(candidate.alternatives),
            candidate.explanation,
            JSON.stringify(imagesSnapshot),
          ],
        );
      }
    }

    await client.query("commit");
  } catch {
    await client.query("rollback").catch(() => undefined);
    if (copiedImagePaths.length) await del(copiedImagePaths).catch(() => undefined);
    packageId = "";
  } finally {
    client.release();
  }

  if (!packageId) redirectWithError(pageParams, failedMessage);
  revalidatePath("/pacotes");
  revalidatePath("/", "page");
  redirect(`/pacotes?periodId=${periodId}&disciplineId=${disciplineId}&contentId=${contentId}&createdPackageId=${packageId}&notice=${encodeURIComponent("Pacote criado com as versões e gabaritos congelados.")}`);
}
