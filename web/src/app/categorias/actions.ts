"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NoticeParams = {
  periodId?: string;
  disciplineId?: string;
  contentId?: string;
};

function textField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function makeUrl(params: NoticeParams, kind: "notice" | "error", message: string) {
  const query = new URLSearchParams();
  if (params.periodId && uuidPattern.test(params.periodId)) query.set("periodId", params.periodId);
  if (params.disciplineId && uuidPattern.test(params.disciplineId)) query.set("disciplineId", params.disciplineId);
  if (params.contentId && uuidPattern.test(params.contentId)) query.set("contentId", params.contentId);
  query.set(kind, message);
  return `/categorias?${query.toString()}`;
}

async function finish(params: NoticeParams, kind: "notice" | "error", message: string): Promise<never> {
  revalidatePath("/categorias");
  redirect(makeUrl(params, kind, message));
}

function validUuid(value: string) {
  return uuidPattern.test(value);
}

export async function createAcademicTerm(formData: FormData) {
  await requireUser();
  const name = textField(formData, "name");

  if (!name || name.length > 30) {
    await finish({}, "error", "Informe um período letivo com até 30 caracteres.");
  }

  const result = await getDatabase().query<{ id: string }>(
    `insert into public.academic_terms (name)
     values ($1)
     on conflict do nothing
     returning id`,
    [name],
  );

  if (!result.rows[0]) {
    await finish({}, "error", "Este período letivo já está cadastrado.");
  }

  await finish({ periodId: result.rows[0].id }, "notice", "Período letivo cadastrado.");
}

export async function createDiscipline(formData: FormData) {
  await requireUser();
  const periodId = textField(formData, "periodId");
  const name = textField(formData, "name");
  const description = textField(formData, "description");
  const params = { periodId };

  if (!validUuid(periodId)) await finish({}, "error", "Selecione um período letivo válido.");
  if (!name || name.length > 100 || description.length > 500) {
    await finish(params, "error", "Informe o nome da disciplina; a descrição pode ter até 500 caracteres.");
  }

  const pool = getDatabase();
  const client = await pool.connect();
  let disciplineId: string | undefined;
  try {
    await client.query("begin");
    const inserted = await client.query<{ id: string }>(
      `insert into public.disciplines (name, description)
       values ($1, $2)
       on conflict do nothing
       returning id`,
      [name, description],
    );
    disciplineId = inserted.rows[0]?.id;
    if (disciplineId) {
      await client.query(
        `insert into public.term_disciplines (term_id, discipline_id)
         values ($1, $2)`,
        [periodId, disciplineId],
      );
    }
    await client.query("commit");
  } catch {
    await client.query("rollback");
    await finish(params, "error", "Não foi possível cadastrar a disciplina.");
  } finally {
    client.release();
  }

  if (!disciplineId) {
    await finish(params, "error", "Essa disciplina já existe. Use a opção para vinculá-la ao período.");
  }
  await finish({ periodId, disciplineId }, "notice", "Disciplina cadastrada e vinculada ao período.");
}

export async function associateDiscipline(formData: FormData) {
  await requireUser();
  const periodId = textField(formData, "periodId");
  const disciplineId = textField(formData, "disciplineId");
  const params = { periodId };

  if (!validUuid(periodId) || !validUuid(disciplineId)) {
    await finish({}, "error", "Selecione o período e a disciplina.");
  }

  const result = await getDatabase().query(
    `insert into public.term_disciplines (term_id, discipline_id)
     select t.id, d.id
     from public.academic_terms t
     cross join public.disciplines d
     where t.id = $1 and d.id = $2
     on conflict do nothing
     returning discipline_id`,
    [periodId, disciplineId],
  );

  if (!result.rowCount) {
    await finish(params, "error", "A disciplina já está neste período ou não foi encontrada.");
  }

  await finish({ periodId, disciplineId }, "notice", "Disciplina vinculada ao período.");
}

export async function createContent(formData: FormData) {
  await requireUser();
  const periodId = textField(formData, "periodId");
  const disciplineId = textField(formData, "disciplineId");
  const name = textField(formData, "name");
  const description = textField(formData, "description");
  const params = { periodId, disciplineId };

  if (!validUuid(periodId) || !validUuid(disciplineId)) {
    await finish({}, "error", "Selecione o período e a disciplina.");
  }
  if (!name || name.length > 100 || description.length > 500) {
    await finish(params, "error", "Informe o nome do conteúdo; a descrição pode ter até 500 caracteres.");
  }

  const result = await getDatabase().query<{ id: string }>(
    `insert into public.contents (discipline_id, name, description)
     select d.id, $3, $4
     from public.term_disciplines td
     join public.disciplines d on d.id = td.discipline_id
     where td.term_id = $1 and td.discipline_id = $2
     on conflict do nothing
     returning id`,
    [periodId, disciplineId, name, description],
  );

  if (!result.rows[0]) {
    await finish(params, "error", "O conteúdo já existe nesta disciplina ou a disciplina não foi encontrada.");
  }

  await finish({ ...params, contentId: result.rows[0].id }, "notice", "Conteúdo cadastrado.");
}

export async function createQuestionType(formData: FormData) {
  await requireUser();
  const periodId = textField(formData, "periodId");
  const disciplineId = textField(formData, "disciplineId");
  const contentId = textField(formData, "contentId");
  const name = textField(formData, "name");
  const description = textField(formData, "description");
  const alternativesCount = Number(textField(formData, "alternativesCount"));
  const params = { periodId, disciplineId, contentId };

  if (!validUuid(periodId) || !validUuid(disciplineId) || !validUuid(contentId)) {
    await finish({}, "error", "Selecione o período, a disciplina e o conteúdo.");
  }
  if (!name || name.length > 100 || description.length > 500) {
    await finish(params, "error", "Informe o nome do tipo; a descrição pode ter até 500 caracteres.");
  }
  if (!Number.isInteger(alternativesCount) || alternativesCount < 2 || alternativesCount > 8) {
    await finish(params, "error", "Escolha entre 2 e 8 alternativas.");
  }

  const result = await getDatabase().query<{ id: string }>(
    `insert into public.question_types (content_id, name, description, alternatives_count)
     select c.id, $4, $5, $6
     from public.term_disciplines td
     join public.contents c on c.discipline_id = td.discipline_id
     where td.term_id = $1 and td.discipline_id = $2 and c.id = $3
     on conflict do nothing
     returning id`,
    [periodId, disciplineId, contentId, name, description, alternativesCount],
  );

  if (!result.rows[0]) {
    await finish(params, "error", "O tipo já existe neste conteúdo ou a seleção não foi encontrada.");
  }

  await finish({ ...params, contentId }, "notice", "Tipo de questão cadastrado.");
}
