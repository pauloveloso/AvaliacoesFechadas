import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db";
import { createExamPackagePdf, type ExamPackageSnapshot, type ExamQuestionSnapshot } from "@/lib/pdf/exam-package-pdf";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PackageRow = Omit<ExamPackageSnapshot, "versions">;
type VersionRow = { id: string; version_number: number; version_label: string; qr_token: string };
type QuestionRow = ExamQuestionSnapshot & { version_id: string };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ packageId: string }> },
) {
  await requireUser();
  const { packageId } = await params;
  if (!uuidPattern.test(packageId)) return new Response("Pacote não encontrado.", { status: 404 });

  const documentKind = new URL(request.url).searchParams.get("document") ?? "provas";
  if (documentKind !== "provas" && documentKind !== "gabaritos") {
    return new Response("Documento inválido.", { status: 400 });
  }

  const pool = getDatabase();
  const packageResult = await pool.query<PackageRow>(
    `select p.title, p.question_count, p.total_points, p.instructions, p.campus_name,
            t.name as period, d.name as discipline, c.name as content
     from public.exam_packages p
     join public.academic_terms t on t.id = p.term_id
     join public.disciplines d on d.id = p.discipline_id
     join public.contents c on c.id = p.content_id
     where p.id = $1`,
    [packageId],
  );
  const packageRow = packageResult.rows[0];
  if (!packageRow) return new Response("Pacote não encontrado.", { status: 404 });

  const versionsResult = await pool.query<VersionRow>(
    `select id, version_number, version_label, qr_token
     from public.exam_versions where package_id = $1 order by version_number`,
    [packageId],
  );
  const versionIds = versionsResult.rows.map((version) => version.id);
  const questionsResult = versionIds.length
    ? await pool.query<QuestionRow>(
      `select version_id, position, question_type_name, difficulty, points,
              statement_snapshot, alternatives_snapshot, explanation_snapshot, images_snapshot
       from public.exam_version_questions
       where version_id = any($1::uuid[])
       order by version_id, position`,
      [versionIds],
    )
    : { rows: [] as QuestionRow[] };

  const questionsByVersion = new Map<string, ExamQuestionSnapshot[]>();
  for (const question of questionsResult.rows) {
    const questions = questionsByVersion.get(question.version_id) ?? [];
    questions.push({
      position: question.position,
      question_type_name: question.question_type_name,
      difficulty: question.difficulty,
      points: question.points,
      statement_snapshot: question.statement_snapshot,
      alternatives_snapshot: question.alternatives_snapshot,
      explanation_snapshot: question.explanation_snapshot,
      images_snapshot: question.images_snapshot,
    });
    questionsByVersion.set(question.version_id, questions);
  }

  const snapshot: ExamPackageSnapshot = {
    ...packageRow,
    versions: versionsResult.rows.map((version) => ({
      version_number: version.version_number,
      version_label: version.version_label,
      qr_token: version.qr_token,
      questions: questionsByVersion.get(version.id) ?? [],
    })),
  };

  try {
    const pdf = await createExamPackagePdf(snapshot, documentKind);
    const safeTitle = snapshot.title.replace(/[^\p{L}\p{N} _.-]+/gu, "").trim().replace(/\s+/g, "-");
    const filename = `${safeTitle}-${documentKind}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Não foi possível gerar este PDF. Verifique se o armazenamento de imagens está configurado.", { status: 503 });
  }
}
