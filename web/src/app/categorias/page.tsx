import { Suspense } from "react";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db";
import {
  associateDiscipline,
  createAcademicTerm,
  createContent,
  createDiscipline,
  createQuestionType,
} from "./actions";

type SearchParams = Promise<{
  periodId?: string;
  disciplineId?: string;
  contentId?: string;
  notice?: string;
  error?: string;
}>;

type AcademicTerm = { id: string; name: string };
type Discipline = { id: string; name: string; description: string };
type Content = { id: string; name: string; description: string };
type QuestionType = {
  id: string;
  name: string;
  description: string;
  alternatives_count: number;
};

function optionCountLabel(count: number) {
  return `${count} ${count === 1 ? "alternativa" : "alternativas"}`;
}

export default function CategoriesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<main className="app-shell">Carregando cadastros…</main>}>
      <CategoriesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CategoriesContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const user = await requireUser();
  const params = await searchParams;
  const pool = getDatabase();

  const termsResult = await pool.query<AcademicTerm>(
    "select id, name from public.academic_terms order by created_at desc, name desc",
  );
  const terms = termsResult.rows;
  const selectedTerm = terms.find((term) => term.id === params.periodId) ?? terms[0];

  let offeredDisciplines: Discipline[] = [];
  let availableDisciplines: Discipline[] = [];
  if (selectedTerm) {
    const [offeredResult, allDisciplinesResult] = await Promise.all([
      pool.query<Discipline>(
        `select d.id, d.name, d.description
         from public.term_disciplines td
         join public.disciplines d on d.id = td.discipline_id
         where td.term_id = $1
         order by d.name`,
        [selectedTerm.id],
      ),
      pool.query<Discipline>(
        "select id, name, description from public.disciplines order by name",
      ),
    ]);
    offeredDisciplines = offeredResult.rows;
    const offeredIds = new Set(offeredDisciplines.map((discipline) => discipline.id));
    availableDisciplines = allDisciplinesResult.rows.filter(
      (discipline) => !offeredIds.has(discipline.id),
    );
  }

  const selectedDiscipline =
    offeredDisciplines.find((discipline) => discipline.id === params.disciplineId) ??
    offeredDisciplines[0];

  let contents: Content[] = [];
  if (selectedDiscipline) {
    const result = await pool.query<Content>(
      `select id, name, description
       from public.contents
       where discipline_id = $1
       order by name`,
      [selectedDiscipline.id],
    );
    contents = result.rows;
  }

  const selectedContent = contents.find((content) => content.id === params.contentId) ?? contents[0];
  let questionTypes: QuestionType[] = [];
  if (selectedContent) {
    const result = await pool.query<QuestionType>(
      `select id, name, description, alternatives_count
       from public.question_types
       where content_id = $1
       order by name`,
      [selectedContent.id],
    );
    questionTypes = result.rows;
  }

  return (
    <AppShell user={user} active="cadastros" breadcrumb="Disciplinas e conteúdos">
      <div className="page-heading">
        <div className="eyebrow dark">ORGANIZAÇÃO DO BANCO DE QUESTÕES</div>
        <h1>Disciplinas e conteúdos</h1>
        <p>Monte a hierarquia que vai organizar suas questões e versões de prova.</p>
      </div>

      {params.notice ? <p className="flash-message" role="status">{params.notice}</p> : null}
      {params.error ? <p className="flash-message error" role="alert">{params.error}</p> : null}

      <section className="catalog-section">
        <div className="catalog-section-heading">
          <span className="catalog-step">01</span>
          <div>
            <h2>Período letivo</h2>
            <p>As disciplinas podem mudar de um semestre para outro, sem perder o histórico.</p>
          </div>
        </div>

        <div className="catalog-controls">
          <form action="/categorias" method="get" className="catalog-form period-select-form">
            <label htmlFor="periodId">Período selecionado</label>
            <div className="catalog-inline-control">
              <select id="periodId" name="periodId" defaultValue={selectedTerm?.id ?? ""} required>
                <option value="" disabled>Selecione um período</option>
                {terms.map((term) => <option value={term.id} key={term.id}>{term.name}</option>)}
              </select>
              <button className="button-secondary" type="submit">Abrir período</button>
            </div>
          </form>

          <form action={createAcademicTerm} className="catalog-form new-period-form">
            <label htmlFor="newPeriodName">Cadastrar período</label>
            <div className="catalog-inline-control">
              <input
                id="newPeriodName"
                name="name"
                type="text"
                placeholder="Ex.: 2026.1"
                maxLength={30}
                required
              />
              <button type="submit">Criar período</button>
            </div>
          </form>
        </div>
      </section>

      {!selectedTerm ? (
        <section className="empty-state">
          <h2>Comece cadastrando o período letivo</h2>
          <p>Depois você poderá incluir as disciplinas oferecidas neste semestre.</p>
        </section>
      ) : (
        <>
          <section className="catalog-section">
            <div className="catalog-section-heading">
              <span className="catalog-step">02</span>
              <div>
                <h2>Disciplinas de {selectedTerm.name}</h2>
                <p>Cadastre uma disciplina ou vincule outra já existente ao período.</p>
              </div>
            </div>

            <div className="catalog-controls two-columns">
              <form action={createDiscipline} className="catalog-form">
                <input type="hidden" name="periodId" value={selectedTerm.id} />
                <label htmlFor="newDisciplineName">Nova disciplina</label>
                <input
                  id="newDisciplineName"
                  name="name"
                  type="text"
                  placeholder="Ex.: Algoritmos"
                  maxLength={100}
                  required
                />
                <label htmlFor="newDisciplineDescription">Descrição <span>(opcional)</span></label>
                <textarea
                  id="newDisciplineDescription"
                  name="description"
                  rows={2}
                  maxLength={500}
                  placeholder="Observações sobre a disciplina"
                />
                <button type="submit">Cadastrar e incluir no período</button>
              </form>

              <form action={associateDiscipline} className="catalog-form">
                <input type="hidden" name="periodId" value={selectedTerm.id} />
                <label htmlFor="existingDiscipline">Vincular disciplina já cadastrada</label>
                {availableDisciplines.length ? (
                  <>
                    <select id="existingDiscipline" name="disciplineId" required defaultValue="">
                      <option value="" disabled>Selecione uma disciplina</option>
                      {availableDisciplines.map((discipline) => (
                        <option value={discipline.id} key={discipline.id}>{discipline.name}</option>
                      ))}
                    </select>
                    <button className="button-secondary" type="submit">Vincular ao período</button>
                  </>
                ) : (
                  <p className="form-hint">Todas as disciplinas cadastradas já estão vinculadas a este período.</p>
                )}
              </form>
            </div>

            {offeredDisciplines.length ? (
              <div className="catalog-list" aria-label="Disciplinas do período">
                {offeredDisciplines.map((discipline) => (
                  <a
                    className={`catalog-item ${selectedDiscipline?.id === discipline.id ? "selected" : ""}`}
                    href={`/categorias?periodId=${selectedTerm.id}&disciplineId=${discipline.id}`}
                    key={discipline.id}
                  >
                    <span className="catalog-item-title">{discipline.name}</span>
                    <span className="catalog-item-meta">{selectedDiscipline?.id === discipline.id ? "Selecionada" : "Abrir conteúdos"}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="form-hint standalone">Nenhuma disciplina foi incluída neste período ainda.</p>
            )}
          </section>

          {selectedDiscipline ? (
            <section className="catalog-section">
              <div className="catalog-section-heading">
                <span className="catalog-step">03</span>
                <div>
                  <h2>Conteúdos de {selectedDiscipline.name}</h2>
                  <p>Exemplos: Básico, Condicional SE, Repetição, Vetores.</p>
                </div>
              </div>

              <div className="catalog-controls two-columns">
                <form action={createContent} className="catalog-form">
                  <input type="hidden" name="periodId" value={selectedTerm.id} />
                  <input type="hidden" name="disciplineId" value={selectedDiscipline.id} />
                  <label htmlFor="newContentName">Novo conteúdo</label>
                  <input
                    id="newContentName"
                    name="name"
                    type="text"
                    placeholder="Ex.: Condicional SE"
                    maxLength={100}
                    required
                  />
                  <label htmlFor="newContentDescription">Descrição <span>(opcional)</span></label>
                  <textarea
                    id="newContentDescription"
                    name="description"
                    rows={2}
                    maxLength={500}
                    placeholder="O que será avaliado neste conteúdo"
                  />
                  <button type="submit">Cadastrar conteúdo</button>
                </form>

                {contents.length ? (
                  <div className="catalog-list compact" aria-label="Conteúdos da disciplina">
                    {contents.map((content) => (
                      <a
                        className={`catalog-item ${selectedContent?.id === content.id ? "selected" : ""}`}
                        href={`/categorias?periodId=${selectedTerm.id}&disciplineId=${selectedDiscipline.id}&contentId=${content.id}`}
                        key={content.id}
                      >
                        <span className="catalog-item-title">{content.name}</span>
                        <span className="catalog-item-meta">{selectedContent?.id === content.id ? "Selecionado" : "Abrir tipos"}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="form-hint standalone">Cadastre o primeiro conteúdo desta disciplina.</p>
                )}
              </div>
            </section>
          ) : null}

          {selectedContent && selectedDiscipline ? (
            <section className="catalog-section">
              <div className="catalog-section-heading">
                <span className="catalog-step">04</span>
                <div>
                  <h2>Tipos de questão em {selectedContent.name}</h2>
                  <p>Cada tipo fixa o formato e a quantidade de alternativas das questões do grupo.</p>
                </div>
              </div>

              <div className="catalog-controls two-columns">
                <form action={createQuestionType} className="catalog-form">
                  <input type="hidden" name="periodId" value={selectedTerm.id} />
                  <input type="hidden" name="disciplineId" value={selectedDiscipline.id} />
                  <input type="hidden" name="contentId" value={selectedContent.id} />
                  <label htmlFor="newQuestionTypeName">Novo tipo de questão</label>
                  <input
                    id="newQuestionTypeName"
                    name="name"
                    type="text"
                    placeholder="Ex.: Prever a saída do algoritmo"
                    maxLength={100}
                    required
                  />
                  <label htmlFor="newQuestionTypeDescription">Descrição <span>(opcional)</span></label>
                  <textarea
                    id="newQuestionTypeDescription"
                    name="description"
                    rows={2}
                    maxLength={500}
                    placeholder="Orientações ou formato esperado"
                  />
                  <label htmlFor="alternativesCount">Número de alternativas</label>
                  <select id="alternativesCount" name="alternativesCount" defaultValue="5">
                    {[2, 3, 4, 5, 6, 7, 8].map((count) => (
                      <option value={count} key={count}>{count} alternativas</option>
                    ))}
                  </select>
                  <p className="form-hint">Formato: questão fechada de múltipla escolha.</p>
                  <button type="submit">Cadastrar tipo de questão</button>
                </form>

                {questionTypes.length ? (
                  <div className="catalog-list compact" aria-label="Tipos de questão do conteúdo">
                    {questionTypes.map((type) => (
                      <a
                        className="catalog-item static"
                        href={`/questoes?periodId=${selectedTerm.id}&disciplineId=${selectedDiscipline.id}&contentId=${selectedContent.id}&questionTypeId=${type.id}`}
                        key={type.id}
                      >
                        <span className="catalog-item-title">{type.name}</span>
                        <span className="catalog-item-meta">Múltipla escolha · {optionCountLabel(type.alternatives_count)}</span>
                        {type.description ? <span className="catalog-item-description">{type.description}</span> : null}
                        <span className="catalog-item-meta">Abrir banco de questões →</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="form-hint standalone">Cadastre o primeiro tipo de questão deste conteúdo.</p>
                )}
              </div>
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
