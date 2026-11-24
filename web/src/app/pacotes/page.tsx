import { Suspense } from "react";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db";
import { createExamPackage } from "./actions";

type SearchParams = Promise<{
  periodId?: string;
  disciplineId?: string;
  contentId?: string;
  createdPackageId?: string;
  notice?: string;
  error?: string;
}>;

type NamedItem = { id: string; name: string };
type QuestionType = { id: string; name: string; description: string; alternatives_count: number; easy: number; medium: number; hard: number };
type PackageRow = { id: string; title: string; version_count: number; question_count: number; total_points: string; created_at: Date; period: string; discipline: string; content: string };

const difficultyLabels = { easy: "Fácil", medium: "Média", hard: "Difícil" };
const preferredTypeOrder = ["Saída gerada", "Identificar soluções corretas", "Trecho de código", "Identificar erro"];

export default function PackagesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<main className="app-shell">Carregando pacotes…</main>}>
      <PackagesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PackagesContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const user = await requireUser();
  const params = await searchParams;
  const pool = getDatabase();

  const termsResult = await pool.query<NamedItem>(
    "select id, name from public.academic_terms order by created_at desc, name desc",
  );
  const terms = termsResult.rows;
  const term = terms.find((item) => item.id === params.periodId) ?? terms[0];

  let disciplines: NamedItem[] = [];
  if (term) {
    const result = await pool.query<NamedItem>(
      `select d.id, d.name from public.term_disciplines td
       join public.disciplines d on d.id = td.discipline_id
       where td.term_id = $1 order by d.name`,
      [term.id],
    );
    disciplines = result.rows;
  }
  const discipline = disciplines.find((item) => item.id === params.disciplineId) ?? disciplines[0];

  let contents: NamedItem[] = [];
  if (discipline) {
    const result = await pool.query<NamedItem>(
      "select id, name from public.contents where discipline_id = $1 order by name",
      [discipline.id],
    );
    contents = result.rows;
  }
  const content = contents.find((item) => item.id === params.contentId) ?? contents[0];

  let questionTypes: QuestionType[] = [];
  if (content) {
    const result = await pool.query<QuestionType>(
      `select qt.id, qt.name, qt.description, qt.alternatives_count,
              count(q.id) filter (where q.difficulty = 'easy')::int as easy,
              count(q.id) filter (where q.difficulty = 'medium')::int as medium,
              count(q.id) filter (where q.difficulty = 'hard')::int as hard
       from public.question_types qt
       left join public.questions q on q.question_type_id = qt.id and q.is_active = true
       where qt.content_id = $1
       group by qt.id
       order by qt.name`,
      [content.id],
    );
    questionTypes = result.rows.sort((a, b) => {
      const aIndex = preferredTypeOrder.indexOf(a.name);
      const bIndex = preferredTypeOrder.indexOf(b.name);
      const aPriority = aIndex === -1 ? preferredTypeOrder.length : aIndex;
      const bPriority = bIndex === -1 ? preferredTypeOrder.length : bIndex;
      return aPriority - bPriority || a.name.localeCompare(b.name, "pt-BR");
    });
  }

  const packagesResult = await pool.query<PackageRow>(
    `select p.id, p.title, p.version_count, p.question_count, p.total_points, p.created_at,
            t.name as period, d.name as discipline, c.name as content
     from public.exam_packages p
     join public.academic_terms t on t.id = p.term_id
     join public.disciplines d on d.id = p.discipline_id
     join public.contents c on c.id = p.content_id
     order by p.created_at desc limit 20`,
  );
  const defaultPoints = (10 / 4).toFixed(2);

  return (
    <AppShell user={user} active="packages" breadcrumb="Pacotes de provas">
      <div className="page-heading">
        <div className="eyebrow dark">MONTAGEM DE AVALIAÇÕES</div>
        <h1>Pacotes de provas</h1>
        <p>Monte versões com a mesma estrutura e dificuldade, congele o conteúdo escolhido e baixe as provas e os gabaritos em PDF.</p>
      </div>

      {params.notice ? <p className="flash-message" role="status">{params.notice}</p> : null}
      {params.error ? <p className="flash-message error" role="alert">{params.error}</p> : null}

      {params.createdPackageId && /^[0-9a-f-]{36}$/i.test(params.createdPackageId) ? (
        <section className="package-created-panel" aria-label="Pacote pronto para download">
          <div><strong>Pacote pronto.</strong><span>Baixe o caderno do aluno e o gabarito do professor.</span></div>
          <div className="package-download-links">
            <a href={`/api/pacotes/${params.createdPackageId}/pdf?document=provas`}>Baixar provas PDF</a>
            <a href={`/api/pacotes/${params.createdPackageId}/pdf?document=gabaritos`}>Baixar gabaritos PDF</a>
          </div>
        </section>
      ) : null}

      <section className="catalog-section package-context-section">
        <div className="catalog-section-heading">
          <span className="catalog-step">1</span>
          <div>
            <h2>Escolha a disciplina e o conteúdo</h2>
            <p>Os tipos de questão disponíveis serão carregados a partir do conteúdo selecionado.</p>
          </div>
        </div>
        {terms.length ? (
          <form className="package-context-form" method="get" action="/pacotes">
            <label>Período
              <select name="periodId" defaultValue={term?.id} required>
                {terms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>Disciplina
              <select name="disciplineId" defaultValue={discipline?.id} required>
                {disciplines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>Conteúdo
              <select name="contentId" defaultValue={content?.id} required>
                {contents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <button type="submit">Atualizar opções</button>
          </form>
        ) : (
          <p className="form-hint standalone">Cadastre um período, uma disciplina, um conteúdo e tipos de questão antes de montar um pacote.</p>
        )}
      </section>

      {content && questionTypes.length ? (
        <section className="catalog-section package-builder-section">
          <div className="catalog-section-heading">
            <span className="catalog-step">2</span>
            <div>
              <h2>Defina a estrutura das versões</h2>
              <p>{discipline?.name} · {content.name}. Cada posição recebe questões do mesmo tipo e nível em todas as versões.</p>
            </div>
          </div>

          <form action={createExamPackage} className="package-builder-form">
            <input type="hidden" name="periodId" value={term?.id ?? ""} />
            <input type="hidden" name="disciplineId" value={discipline?.id ?? ""} />
            <input type="hidden" name="contentId" value={content.id} />

            <div className="package-builder-top-fields">
              <label>Nome do pacote
                <input name="title" type="text" maxLength={120} defaultValue={`${discipline?.name} — ${content.name} · ${term?.name}`} required />
              </label>
              <label>Número de versões
                <select name="versionCount" defaultValue="3">
                  {Array.from({ length: 30 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
                </select>
              </label>
              <label>Questões por prova
                <select name="questionCount" defaultValue="4">
                  {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
                </select>
              </label>
            </div>

            <label className="package-instructions-field">Instrução específica (opcional)
              <textarea name="instructions" maxLength={500} rows={2} placeholder="Será impressa junto às instruções básicas da avaliação." />
              <span>Máximo de 500 caracteres. As instruções básicas de preenchimento do gabarito já serão incluídas.</span>
            </label>

            <div className="package-slot-heading">
              <div><strong>Posição</strong><strong>Tipo de questão</strong><strong>Dificuldade</strong><strong>Valor (pontos)</strong></div>
              <p>Preencha as primeiras posições indicadas em “Questões por prova”. Os valores serão somados para calcular o total da avaliação.</p>
            </div>

            <div className="package-slot-list">
              {Array.from({ length: 10 }, (_, index) => {
                const position = index + 1;
                const defaultType = questionTypes[index] ?? questionTypes[0];
                return (
                  <div className="package-slot-row" key={position}>
                    <strong className="package-slot-number">Questão {position}</strong>
                    <select name={`questionType${position}`} aria-label={`Tipo da questão ${position}`} defaultValue={defaultType.id}>
                      {questionTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name} · {type.alternatives_count} alt. · média {type.medium}
                        </option>
                      ))}
                    </select>
                    <select name={`difficulty${position}`} aria-label={`Dificuldade da questão ${position}`} defaultValue="medium">
                      {Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input name={`points${position}`} aria-label={`Valor da questão ${position}`} type="number" min="0.01" max="100" step="0.01" defaultValue={defaultPoints} />
                  </div>
                );
              })}
            </div>

            <div className="package-builder-footer">
              <p>O sistema prioriza questões diferentes entre versões. Se uma posição tiver menos questões cadastradas do que versões solicitadas, poderá reutilizar algumas.</p>
              <button type="submit">Montar pacote e gerar PDFs</button>
            </div>
          </form>
        </section>
      ) : content ? (
        <section className="empty-state"><h2>Este conteúdo ainda não tem tipos de questão</h2><p>Cadastre os tipos e as questões antes de montar as versões.</p><a className="auth-link-button" href="/categorias">Abrir cadastros</a></section>
      ) : null}

      <section className="catalog-section package-history-section">
        <div className="catalog-section-heading">
          <span className="catalog-step">{packagesResult.rows.length}</span>
          <div><h2>Pacotes criados</h2><p>As questões e os gabaritos de cada versão permanecem congelados mesmo que o banco de questões seja editado depois.</p></div>
        </div>
        {packagesResult.rows.length ? (
          <div className="package-history-list">
            {packagesResult.rows.map((item) => (
              <article className="package-history-item" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.period} · {item.discipline} · {item.content} · {item.version_count} versões · {item.question_count} questões · Total {Number(item.total_points).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} pontos</span>
                </div>
                <div className="package-download-links">
                  <a href={`/api/pacotes/${item.id}/pdf?document=provas`}>Provas PDF</a>
                  <a href={`/api/pacotes/${item.id}/pdf?document=gabaritos`}>Gabaritos PDF</a>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="form-hint standalone">Ainda não há pacotes. O primeiro pode ser montado acima.</p>}
      </section>
    </AppShell>
  );
}
