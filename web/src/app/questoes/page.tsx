import { Suspense } from "react";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db";
import { saveQuestion } from "./actions";

type SearchParams = Promise<{
  periodId?: string;
  disciplineId?: string;
  contentId?: string;
  questionTypeId?: string;
  editQuestionId?: string;
  page?: string;
  notice?: string;
  error?: string;
}>;

type AcademicTerm = { id: string; name: string };
type Discipline = { id: string; name: string };
type Content = { id: string; name: string };
type QuestionType = {
  id: string;
  name: string;
  description: string;
  alternatives_count: number;
};
type Question = {
  id: string;
  statement: string | null;
  explanation: string | null;
  difficulty: "easy" | "medium" | "hard";
  alternatives_count: number;
  correct_option: number | null;
  alternatives: { number: number; text: string; is_correct: boolean }[] | null;
  images: { id: string; alt_text: string }[];
  created_at: Date;
};

const pageSize = 20;
const difficultyLabels = { easy: "Fácil", medium: "Média", hard: "Difícil" };
const letters = "ABCDEFGH";

function safePage(value?: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function questionHref(params: {
  periodId: string;
  disciplineId: string;
  contentId: string;
  questionTypeId: string;
  page?: number;
  editQuestionId?: string;
}) {
  const query = new URLSearchParams({
    periodId: params.periodId,
    disciplineId: params.disciplineId,
    contentId: params.contentId,
    questionTypeId: params.questionTypeId,
  });
  if (params.page && params.page > 1) query.set("page", String(params.page));
  if (params.editQuestionId) query.set("editQuestionId", params.editQuestionId);
  return `/questoes?${query.toString()}`;
}

export default function QuestionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<main className="app-shell">Carregando banco de questões…</main>}>
      <QuestionsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function QuestionsContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const user = await requireUser();
  const params = await searchParams;
  const pool = getDatabase();
  const requestedPage = safePage(params.page);

  const termsResult = await pool.query<AcademicTerm>(
    "select id, name from public.academic_terms order by created_at desc, name desc",
  );
  const terms = termsResult.rows;
  const term = terms.find((item) => item.id === params.periodId) ?? terms[0];

  let disciplines: Discipline[] = [];
  if (term) {
    const result = await pool.query<Discipline>(
      `select d.id, d.name
       from public.term_disciplines td
       join public.disciplines d on d.id = td.discipline_id
       where td.term_id = $1
       order by d.name`,
      [term.id],
    );
    disciplines = result.rows;
  }
  const discipline = disciplines.find((item) => item.id === params.disciplineId) ?? disciplines[0];

  let contents: Content[] = [];
  if (discipline) {
    const result = await pool.query<Content>(
      "select id, name from public.contents where discipline_id = $1 order by name",
      [discipline.id],
    );
    contents = result.rows;
  }
  const content = contents.find((item) => item.id === params.contentId) ?? contents[0];

  let questionTypes: QuestionType[] = [];
  if (content) {
    const result = await pool.query<QuestionType>(
      `select id, name, description, alternatives_count
       from public.question_types
       where content_id = $1
       order by name`,
      [content.id],
    );
    questionTypes = result.rows;
  }
  const questionType = questionTypes.find((item) => item.id === params.questionTypeId) ?? questionTypes[0];

  let totalQuestions = 0;
  let questions: Question[] = [];
  let currentPage = 1;
  if (questionType) {
    const countResult = await pool.query<{ total: number }>(
      "select count(*)::int as total from public.questions where question_type_id = $1 and is_active = true",
      [questionType.id],
    );
    totalQuestions = countResult.rows[0]?.total ?? 0;
    currentPage = Math.min(requestedPage, Math.max(1, Math.ceil(totalQuestions / pageSize)));
    const offset = (currentPage - 1) * pageSize;
    const questionsResult = await pool.query<Question>(
      `select q.id,
              q.statement #>> '{0,text}' as statement,
              q.explanation,
              q.difficulty,
              q.created_at,
              count(o.id)::int as alternatives_count,
              max(case when o.is_correct then o.option_number end)::int as correct_option,
              json_agg(json_build_object(
                'number', o.option_number,
                'text', o.content #>> '{0,text}',
                'is_correct', o.is_correct
              ) order by o.option_number) filter (where o.id is not null) as alternatives
       from public.questions q
       left join public.question_options o on o.question_id = q.id
       where q.question_type_id = $1 and q.is_active = true
       group by q.id
       order by q.created_at desc, q.id
       limit $2 offset $3`,
      [questionType.id, pageSize, offset],
    );
    questions = questionsResult.rows;
    if (questions.length) {
      const imagesResult = await pool.query<{ id: string; question_id: string; alt_text: string }>(
        `select id, question_id, alt_text
         from public.question_images
         where question_id = any($1::uuid[])
         order by sort_order`,
        [questions.map((question) => question.id)],
      );
      const imagesByQuestion = new Map<string, { id: string; alt_text: string }[]>();
      for (const image of imagesResult.rows) {
        const images = imagesByQuestion.get(image.question_id) ?? [];
        images.push({ id: image.id, alt_text: image.alt_text });
        imagesByQuestion.set(image.question_id, images);
      }
      questions = questions.map((question) => ({
        ...question,
        images: imagesByQuestion.get(question.id) ?? [],
      }));
    }
  }

  const pagesCount = Math.max(1, Math.ceil(totalQuestions / pageSize));
  const editingQuestion = questions.find((question) => question.id === params.editQuestionId);
  const selection = term && discipline && content && questionType
    ? { periodId: term.id, disciplineId: discipline.id, contentId: content.id, questionTypeId: questionType.id }
    : null;

  return (
    <AppShell user={user} active="questions" breadcrumb="Banco de questões">
      <div className="page-heading">
        <div className="eyebrow dark">CADASTRO DE QUESTÕES</div>
        <h1>Banco de questões</h1>
        <p>Cadastre questões fechadas e indique o gabarito para cada alternativa.</p>
      </div>

      {params.notice ? <p className="flash-message" role="status">{params.notice}</p> : null}
      {params.error ? <p className="flash-message error" role="alert">{params.error}</p> : null}

      {selection ? (
        <>
          <section className="question-context">
            <div className="question-context-item"><span>Período</span><strong>{term.name}</strong></div>
            <div className="question-context-item"><span>Disciplina</span><strong>{discipline.name}</strong></div>
            <div className="question-context-item"><span>Conteúdo</span><strong>{content.name}</strong></div>
            <div className="question-context-item"><span>Tipo de questão</span><strong>{questionType.name}</strong></div>
            <a href={`/categorias?periodId=${term.id}&disciplineId=${discipline.id}&contentId=${content.id}`}>Trocar tipo</a>
          </section>

          <section className="catalog-section question-editor-section">
            <div className="catalog-section-heading">
              <span className="catalog-step">+</span>
              <div>
                <h2>{editingQuestion ? "Editar questão" : "Nova questão"}</h2>
                <p>{questionType.alternatives_count} alternativas · marque uma como gabarito. Quebras de linha e indentação são preservadas.</p>
              </div>
            </div>

            <form action={saveQuestion} className="question-editor">
              <input type="hidden" name="periodId" value={term.id} />
              <input type="hidden" name="disciplineId" value={discipline.id} />
              <input type="hidden" name="contentId" value={content.id} />
              <input type="hidden" name="questionTypeId" value={questionType.id} />
              <input type="hidden" name="questionId" value={editingQuestion?.id ?? ""} />
              <input type="hidden" name="page" value={String(currentPage)} />

              <label htmlFor="questionStatement">Enunciado</label>
              <textarea
                className="question-textarea statement-textarea"
                id="questionStatement"
                name="statement"
                rows={7}
                maxLength={20_000}
                placeholder="Escreva o enunciado. Você pode incluir trechos de código e usar quebras de linha."
                defaultValue={editingQuestion?.statement ?? ""}
                required
              />

              <div className="question-image-fields">
                <label htmlFor="questionImages">Imagens da questão <span>(opcional, até 3 arquivos JPEG, PNG ou WebP; 1 MB por arquivo)</span></label>
                <input
                  className="question-image-input"
                  id="questionImages"
                  name="questionImages"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                />
                <label htmlFor="imageAltText">Descrição das imagens <span>(opcional; usada para acessibilidade)</span></label>
                <input
                  className="question-image-alt-input"
                  id="imageAltText"
                  name="imageAltText"
                  type="text"
                  maxLength={300}
                  placeholder="Descreva o que aparece nas imagens"
                  defaultValue={editingQuestion?.images[0]?.alt_text ?? ""}
                />
                {editingQuestion?.images.length ? (
                  <div className="question-image-existing">
                    <p>Imagens já anexadas. Marque as que deseja remover:</p>
                    <div className="question-image-grid">
                      {editingQuestion.images.map((image, index) => (
                        <label className="question-image-card" key={image.id}>
                          <img src={`/api/questoes/imagens/${image.id}`} alt={image.alt_text || `Imagem ${index + 1} da questão`} />
                          <span><input type="checkbox" name="removeImageIds" value={image.id} /> Remover</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="alternative-editor-grid">
                {Array.from({ length: questionType.alternatives_count }, (_, index) => {
                  const number = index + 1;
                  return (
                    <div className="alternative-editor" key={number}>
                      <div className="alternative-editor-heading">
                        <label htmlFor={`alternative${number}`}>Alternativa {letters[index]}</label>
                        <label className="correct-answer-choice">
                          <input
                            type="radio"
                            name="correctOption"
                            value={number}
                            required={number === 1}
                            defaultChecked={editingQuestion?.correct_option === number}
                          />
                          <span>Gabarito</span>
                        </label>
                      </div>
                      <textarea
                        className="question-textarea"
                        id={`alternative${number}`}
                        name={`alternative${number}`}
                        rows={3}
                        maxLength={5_000}
                        placeholder={`Texto da alternativa ${letters[index]}`}
                        defaultValue={editingQuestion?.alternatives?.find((alternative) => alternative.number === number)?.text ?? ""}
                        required
                      />
                    </div>
                  );
                })}
              </div>

              <div className="question-editor-bottom">
                <div className="question-editor-fields">
                  <label htmlFor="questionDifficulty">Dificuldade</label>
                  <select id="questionDifficulty" name="difficulty" defaultValue={editingQuestion?.difficulty ?? "medium"}>
                    <option value="easy">Fácil</option>
                    <option value="medium">Média</option>
                    <option value="hard">Difícil</option>
                  </select>
                  <label htmlFor="questionExplanation">Explicação do gabarito <span>(opcional)</span></label>
                  <textarea
                    className="question-textarea"
                    id="questionExplanation"
                    name="explanation"
                    rows={3}
                    maxLength={10_000}
                    placeholder="Anotação para consulta posterior"
                    defaultValue={editingQuestion?.explanation ?? ""}
                  />
                </div>
                <div className="question-editor-actions">
                  {editingQuestion ? (
                    <a className="question-cancel-link" href={questionHref({ ...selection, page: currentPage })}>Cancelar edição</a>
                  ) : null}
                  <button type="submit">{editingQuestion ? "Salvar alterações" : "Salvar questão"}</button>
                </div>
              </div>
            </form>
          </section>

          <section className="catalog-section question-bank-section">
            <div className="catalog-section-heading">
              <span className="catalog-step">{totalQuestions}</span>
              <div>
                <h2>Questões cadastradas</h2>
                <p>Questões deste tipo podem ser reutilizadas em diferentes avaliações e pacotes.</p>
              </div>
            </div>

            {questions.length ? (
              <>
                <div className="question-bank-list">
                  {questions.map((question, index) => (
                    <article className="question-bank-item" key={question.id}>
                      <div className="question-bank-item-heading">
                        <strong>Questão {(currentPage - 1) * pageSize + index + 1}</strong>
                        <div className="question-bank-item-controls">
                          <span>{difficultyLabels[question.difficulty]}</span>
                          <a href={questionHref({ ...selection, page: currentPage, editQuestionId: question.id })}>Editar</a>
                        </div>
                      </div>
                      <p className="question-bank-statement">{question.statement}</p>
                      {question.images.length ? (
                        <div className="question-bank-images">
                          {question.images.map((image, imageIndex) => (
                            <img
                              key={image.id}
                              src={`/api/questoes/imagens/${image.id}`}
                              alt={image.alt_text || `Imagem ${imageIndex + 1} da questão`}
                            />
                          ))}
                        </div>
                      ) : null}
                      <ul className="question-bank-alternatives">
                        {question.alternatives?.map((alternative) => (
                          <li className={alternative.is_correct ? "correct" : ""} key={alternative.number}>
                            <strong>{letters[alternative.number - 1]}.</strong>
                            <span>{alternative.text}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="question-bank-item-footer">
                        <span>{question.alternatives_count} alternativas</span>
                        {question.correct_option ? <span>Gabarito: {letters[question.correct_option - 1]}</span> : <span>Sem gabarito</span>}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="question-pagination">
                  <span>Exibindo {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalQuestions)} de {totalQuestions}</span>
                  <div>
                    {currentPage > 1 ? (
                      <a className="button-secondary" href={questionHref({ ...selection, page: currentPage - 1 })}>Anterior</a>
                    ) : null}
                    {currentPage < pagesCount ? (
                      <a className="button-secondary" href={questionHref({ ...selection, page: currentPage + 1 })}>Próxima</a>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <p className="form-hint standalone">Ainda não há questões deste tipo. Cadastre a primeira usando o formulário acima.</p>
            )}
          </section>
        </>
      ) : (
        <section className="empty-state">
          <h2>Selecione um tipo de questão</h2>
          <p>Escolha um tipo já cadastrado para adicionar questões ao banco.</p>
          <a className="auth-link-button" href="/categorias">Abrir cadastros</a>
        </section>
      )}
    </AppShell>
  );
}
