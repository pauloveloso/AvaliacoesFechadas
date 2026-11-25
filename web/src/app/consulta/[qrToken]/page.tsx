import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db";

type VersionInfo = {
  id: string;
  version_label: string;
  title: string;
  total_points: string;
  discipline: string;
  content: string;
  period: string;
};
type Option = { number: number; text: string; is_correct: boolean };
type Question = {
  position: number;
  points: string;
  statement_snapshot: { text?: string }[];
  alternatives_snapshot: Option[];
  explanation_snapshot: string | null;
};

const letters = "ABCDEFGH";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function AnswerKeyPage({ params }: { params: Promise<{ qrToken: string }> }) {
  return <Suspense fallback={<main className="app-shell">Carregando gabarito…</main>}><AnswerKeyContent params={params} /></Suspense>;
}

async function AnswerKeyContent({ params }: { params: Promise<{ qrToken: string }> }) {
  await connection();
  const user = await requireUser();
  const { qrToken } = await params;
  if (!uuidPattern.test(qrToken)) notFound();

  const pool = getDatabase();
  const result = await pool.query<VersionInfo>(
    `select v.id, v.version_label, p.title, p.total_points,
            d.name as discipline, c.name as content, t.name as period
     from public.exam_versions v
     join public.exam_packages p on p.id = v.package_id
     join public.disciplines d on d.id = p.discipline_id
     join public.contents c on c.id = p.content_id
     join public.academic_terms t on t.id = p.term_id
     where v.qr_token = $1::uuid`,
    [qrToken],
  );
  const version = result.rows[0];
  if (!version) notFound();

  const questionsResult = await pool.query<Question>(
    `select position, points, statement_snapshot, alternatives_snapshot, explanation_snapshot
     from public.exam_version_questions where version_id = $1 order by position`,
    [version.id],
  );

  return (
    <AppShell user={user} active="packages" breadcrumb="Gabarito da avaliação">
      <div className="page-heading">
        <div className="eyebrow dark">CONSULTA DO PROFESSOR · VERSÃO {version.version_label}</div>
        <h1>Gabarito da avaliação</h1>
        <p>{version.title} · {version.discipline} · {version.content} · {version.period}</p>
      </div>
      <section className="catalog-section">
        <h2>Respostas e pontuação</h2>
        <p className="form-hint standalone">Valor total: {Number(version.total_points).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} pontos.</p>
        <div className="answer-key-list">
          {questionsResult.rows.map((question) => {
            const correct = question.alternatives_snapshot.find((option) => option.is_correct);
            const statement = question.statement_snapshot.map((segment) => segment.text ?? "").join("");
            return (
              <article className="catalog-section" key={question.position}>
                <h3>Questão {question.position} · {correct ? letters[correct.number - 1] : "Sem gabarito"} · {Number(question.points).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} pontos</h3>
                <p>{statement}</p>
                {question.alternatives_snapshot.map((option) => (
                  <p key={option.number}>
                    <strong>{letters[option.number - 1]}.</strong> {option.text}{option.is_correct ? " ✓" : ""}
                  </p>
                ))}
                {question.explanation_snapshot ? <p><strong>Explicação:</strong> {question.explanation_snapshot}</p> : null}
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
