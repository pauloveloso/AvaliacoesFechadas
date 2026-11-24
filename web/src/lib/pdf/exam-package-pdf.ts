import { get } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import sharp from "sharp";

export type ExamOptionSnapshot = { number: number; text: string; is_correct: boolean };
export type ExamImageSnapshot = { pathname: string; content_type: string; alt_text: string };
export type ExamQuestionSnapshot = {
  position: number;
  question_type_name: string;
  difficulty: "easy" | "medium" | "hard";
  points: string | number;
  statement_snapshot: { type?: string; text?: string }[];
  alternatives_snapshot: ExamOptionSnapshot[];
  explanation_snapshot: string | null;
  images_snapshot: ExamImageSnapshot[];
};
export type ExamVersionSnapshot = { version_number: number; version_label: string; questions: ExamQuestionSnapshot[] };
export type ExamPackageSnapshot = {
  title: string;
  period: string;
  discipline: string;
  content: string;
  question_count: number;
  total_points: string | number;
  instructions: string;
  versions: ExamVersionSnapshot[];
};

type DocumentKind = "provas" | "gabaritos";
type CodeLine = { text: string; code: boolean };

const pageMargin = 42;
const letters = "ABCDEFGH";
const difficultyLabels = { easy: "Fácil", medium: "Média", hard: "Difícil" };

function getStatementText(question: ExamQuestionSnapshot) {
  return question.statement_snapshot.map((segment) => segment.text ?? "").join("");
}

function getCodeLines(statement: string): CodeLine[] {
  let inCode = false;
  let braceDepth = 0;
  return statement.split("\n").map((text) => {
    const isStart = /^\s*(?:\d+\s+)?programa\s*\{/i.test(text);
    if (!inCode && isStart) {
      inCode = true;
      braceDepth = 0;
    }
    const code = inCode;
    if (inCode) {
      braceDepth += (text.match(/\{/g) ?? []).length;
      braceDepth -= (text.match(/\}/g) ?? []).length;
      if (braceDepth <= 0 && text.includes("}")) inCode = false;
    }
    return { text, code };
  });
}

function makeDocument(title: string) {
  const document = new PDFDocument({
    size: "A4",
    margins: { top: pageMargin, right: pageMargin, bottom: pageMargin, left: pageMargin },
    info: { Title: title, Author: "Avalia" },
    bufferPages: false,
  });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  return { document, result };
}

function formatPoints(points: string | number) {
  return Number(points).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function drawPageFooter(document: PDFKit.PDFDocument) {
  const width = document.page.width - pageMargin * 2;
  const y = document.page.height - 28;
  document.moveTo(pageMargin, y).lineTo(pageMargin + width, y)
    .strokeColor("#aab6af").lineWidth(0.45).stroke();
}

function versionHeader(document: PDFKit.PDFDocument, data: ExamPackageSnapshot, version: ExamVersionSnapshot, logo: Buffer) {
  const width = document.page.width - pageMargin * 2;
  const logoWidth = 225;
  const logoHeight = logoWidth * 335 / 993;
  const logoY = pageMargin;
  document.image(logo, pageMargin, logoY, { fit: [logoWidth, logoHeight] });
  document.fillColor("#172c26").font("Helvetica-Bold").fontSize(12)
    .text("Campus Januária", pageMargin + logoWidth + 14, logoY + logoHeight / 2 - 6, {
      width: width - logoWidth - 14,
      align: "center",
      lineBreak: false,
    });

  const institutionRuleY = logoY + logoHeight + 9;
  document.moveTo(pageMargin, institutionRuleY).lineTo(pageMargin + width, institutionRuleY)
    .strokeColor("#18251f").lineWidth(0.8).stroke();

  const activityY = institutionRuleY + 8;
  document.fillColor("#172c26").font("Helvetica-Bold").fontSize(12)
    .text(`Atividade Avaliativa de ${data.discipline}`, pageMargin, activityY, { width: width - 65 });
  document.fillColor("#53665b").font("Helvetica-Bold").fontSize(9)
    .text(`Versão ${version.version_label}`, pageMargin + width - 65, activityY + 2, { width: 65, align: "right", lineBreak: false });

  const nameY = activityY + 22;
  const half = (width - 18) / 2;
  document.fillColor("#172c26").font("Helvetica").fontSize(8.5)
    .text("Nome:", pageMargin, nameY)
    .moveTo(pageMargin + 31, nameY + 13).lineTo(pageMargin + half, nameY + 13).strokeColor("#8e9d95").lineWidth(0.6).stroke();
  document.text("Turma:", pageMargin + half + 16, nameY)
    .moveTo(pageMargin + half + 49, nameY + 13).lineTo(pageMargin + width, nameY + 13).strokeColor("#8e9d95").lineWidth(0.6).stroke();

  const instructionY = nameY + 23;
  const instructionText = "O gabarito deve ser preenchido à caneta preta ou azul. Marque apenas uma opção por questão.";
  document.fillColor("#172c26").font("Helvetica-Bold").fontSize(8)
    .text("Instruções", pageMargin, instructionY, { width });
  document.fillColor("#34473e").font("Helvetica").fontSize(8.2)
    .text(instructionText, pageMargin, instructionY + 10, { width, lineGap: 1 });
  let answerY = document.y + 5;
  if (data.instructions.trim()) {
    document.fillColor("#34473e").font("Helvetica").fontSize(8.2)
      .text(`Instrução específica: ${data.instructions}`, pageMargin, answerY, { width, lineGap: 1 });
    answerY = document.y + 5;
  }

  const answerBoxHeight = data.question_count > 6 ? 39 : 32;
  const answerLabelWidth = 65;
  document.roundedRect(pageMargin, answerY, width, answerBoxHeight, 4)
    .lineWidth(0.8).strokeColor("#74847b").stroke();
  document.fillColor("#172c26").font("Helvetica-Bold").fontSize(7.5)
    .text("GABARITO", pageMargin + 5, answerY + (answerBoxHeight - 8) / 2, { width: answerLabelWidth - 10 });
  document.moveTo(pageMargin + answerLabelWidth, answerY + 1).lineTo(pageMargin + answerLabelWidth, answerY + answerBoxHeight - 1)
    .strokeColor("#c3cec7").lineWidth(0.55).stroke();
  const boxStart = pageMargin + answerLabelWidth;
  const boxWidth = (width - answerLabelWidth) / data.question_count;
  const compactOptions = data.question_count > 6;
  for (let index = 0; index < data.question_count; index++) {
    const x = boxStart + index * boxWidth;
    const innerWidth = boxWidth - 4;
    if (index > 0) {
      document.moveTo(x, answerY + 1).lineTo(x, answerY + answerBoxHeight - 1)
        .strokeColor("#d6ded9").lineWidth(0.45).stroke();
    }
    document.fillColor("#53665b").font("Helvetica-Bold").fontSize(7)
      .text(String(index + 1), x + 2, answerY + 3, { width: innerWidth, align: "center" });

    const rows = compactOptions ? [["A", "B", "C"], ["D", "E"]] : [["A", "B", "C", "D", "E"]];
    rows.forEach((row, rowIndex) => {
      const itemWidth = innerWidth / row.length;
      const rowY = answerY + (compactOptions ? 13 + rowIndex * 12 : 19);
      row.forEach((letter, letterIndex) => {
        const itemX = x + 2 + letterIndex * itemWidth;
        const radius = compactOptions ? 3.2 : 3.5;
        const circleX = itemX + (compactOptions ? 1.8 : 3.5);
        document.circle(circleX + radius, rowY + radius, radius).lineWidth(0.55).strokeColor("#788a7f").stroke();
        document.fillColor("#53665b").font("Helvetica").fontSize(compactOptions ? 5.8 : 6.3)
          .text(letter, circleX + radius * 2 + (compactOptions ? 1.2 : 1.6), rowY + 0.2, { lineBreak: false });
      });
    });
  }
  const contentRuleY = answerY + answerBoxHeight + 9;
  document.moveTo(pageMargin, contentRuleY).lineTo(pageMargin + width, contentRuleY).strokeColor("#87968e").lineWidth(0.65).stroke();
  document.y = contentRuleY + 10;
}

function continuationHeader(document: PDFKit.PDFDocument, data: ExamPackageSnapshot, version: ExamVersionSnapshot) {
  const width = document.page.width - pageMargin * 2;
  document.fillColor("#172c26").font("Helvetica-Bold").fontSize(10)
    .text(`Atividade Avaliativa de ${data.discipline}`, pageMargin, 30, { width: width - 70 });
  document.fillColor("#53665b").font("Helvetica-Bold").fontSize(8)
    .text(`Versão ${version.version_label}`, pageMargin + width - 65, 32, { width: 65, align: "right", lineBreak: false });
  document.moveTo(pageMargin, 49).lineTo(pageMargin + width, 49).strokeColor("#87968e").lineWidth(0.65).stroke();
  document.y = 61;
}

function textHeight(document: PDFKit.PDFDocument, text: string, width: number, font: string, fontSize: number) {
  if (!text.trim()) return fontSize * 0.65;
  document.font(font).fontSize(fontSize);
  return document.heightOfString(text, { width, lineGap: fontSize * 0.12 }) + fontSize * 0.15;
}

function statementHeight(document: PDFKit.PDFDocument, statement: string, width: number) {
  return getCodeLines(statement).reduce((total, line) =>
    total + (line.text.trim() ? textHeight(document, line.text, width, line.code ? "Courier" : "Helvetica", line.code ? 7.3 : 8.5) : 2), 0);
}

function estimateQuestionHeight(document: PDFKit.PDFDocument, question: ExamQuestionSnapshot, width: number) {
  const alternatives = question.alternatives_snapshot.reduce((total, option) =>
    total + textHeight(document, option.text, width - 24, "Helvetica", 9) + 4, 0);
  return 23 + statementHeight(document, getStatementText(question), width) + 4 +
    question.images_snapshot.length * 150 + alternatives + 4;
}

function drawStatement(document: PDFKit.PDFDocument, statement: string, x: number, width: number) {
  for (const line of getCodeLines(statement)) {
    if (!line.text.trim()) {
      document.moveDown(0.12);
      continue;
    }
    const font = line.code ? "Courier" : "Helvetica";
    const fontSize = line.code ? 7.3 : 8.5;
    document.fillColor(line.code ? "#24352d" : "#25382f").font(font).fontSize(fontSize)
      .text(line.text, x + (line.code ? 5 : 0), document.y, { width: width - (line.code ? 5 : 0), lineGap: fontSize * 0.12 });
  }
}

async function drawImages(document: PDFKit.PDFDocument, images: ExamImageSnapshot[], x: number, width: number) {
  for (const image of images) {
    const stored = await get(image.pathname, { access: "private" });
    if (!stored?.stream || stored.statusCode !== 200) throw new Error("Não foi possível ler uma imagem congelada do pacote.");
    const original = Buffer.from(await new Response(stored.stream).arrayBuffer());
    const rendered = await sharp(original).rotate().resize({ width: Math.floor(width), height: 220, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    if (image.alt_text) {
      document.fillColor("#64766b").font("Helvetica-Oblique").fontSize(7.5).text(image.alt_text, x, document.y + 3, { width });
    }
    const top = document.y + 4;
    document.image(rendered, x, top, { fit: [width, 220], align: "center" });
    document.y = top + Math.min(220, (await sharp(rendered).metadata()).height ?? 180) + 7;
  }
}

function drawQuestionHeading(document: PDFKit.PDFDocument, question: ExamQuestionSnapshot, x: number, width: number) {
  const y = document.y;
  document.roundedRect(x, y, width, 21, 4).fillAndStroke("#eff6f1", "#dbe9df");
  const compact = width < 400;
  document.fillColor("#1e5944").font("Helvetica-Bold").fontSize(compact ? 8 : 9)
    .text(compact ? `Q${question.position}` : `QUESTÃO ${question.position}`, x + 8, y + 6, { width: compact ? 30 : 80 });
  document.fillColor("#486254").font("Helvetica").fontSize(compact ? 7.5 : 8)
    .text(question.question_type_name, x + (compact ? 43 : 95), y + 6, { width: width - (compact ? 105 : 150), lineBreak: false });
  document.fillColor("#276b53").font("Helvetica-Bold").fontSize(8)
    .text(`${formatPoints(question.points)} pts`, x + width - 55, y + 6, { width: 47, align: "right" });
  document.y = y + 28;
}

async function drawStudentQuestion(document: PDFKit.PDFDocument, question: ExamQuestionSnapshot, x: number, width: number, allowPageBreak: boolean) {
  if (allowPageBreak && document.y + estimateQuestionHeight(document, question, width) > document.page.height - pageMargin) {
    document.addPage();
  }
  drawQuestionHeading(document, question, x, width);
  drawStatement(document, getStatementText(question), x, width);
  if (question.images_snapshot.length) {
    document.moveDown(0.2);
    await drawImages(document, question.images_snapshot, x, width);
  }
  document.moveDown(0.15);
  for (const option of question.alternatives_snapshot) {
    const y = document.y + 2;
    document.circle(x + 6, y + 5, 5).lineWidth(0.7).strokeColor("#6f8176").stroke();
    const text = `${letters[option.number - 1]}.  ${option.text}`;
    document.fillColor("#32463b").font("Helvetica").fontSize(8.3)
      .text(text, x + 17, y, { width: width - 17, lineGap: 0.5 });
    document.moveDown(0.1);
  }
  document.moveDown(0.25);
}

function keyHeader(document: PDFKit.PDFDocument, data: ExamPackageSnapshot, version: ExamVersionSnapshot) {
  const width = document.page.width - pageMargin * 2;
  document.fillColor("#276b53").font("Helvetica-Bold").fontSize(8).text("AVALIA · GABARITO DO PROFESSOR", pageMargin, pageMargin, { width });
  document.fillColor("#172c26").font("Helvetica-Bold").fontSize(17).text(data.title, pageMargin, document.y + 5, { width });
  document.fillColor("#53665b").font("Helvetica").fontSize(8.5)
    .text(`${data.discipline}  ·  ${data.content}  ·  ${data.period}  ·  Versão ${version.version_label}`, pageMargin, document.y + 3, { width });
  document.y += 18;
}

function drawAnswerKey(document: PDFKit.PDFDocument, data: ExamPackageSnapshot, version: ExamVersionSnapshot, skipPageHeader: { value: boolean }) {
  const width = document.page.width - pageMargin * 2;
  keyHeader(document, data, version);
  document.roundedRect(pageMargin, document.y, width, 30, 4).fillAndStroke("#eff6f1", "#dbe9df");
  const summaryY = document.y;
  document.fillColor("#1e5944").font("Helvetica-Bold").fontSize(8).text("QUESTÃO", pageMargin + 10, summaryY + 10, { width: 60 });
  const answerStart = pageMargin + 78;
  const answerWidth = (width - 230) / Math.max(1, version.questions.length);
  for (const question of version.questions) {
    const answer = question.alternatives_snapshot.find((option) => option.is_correct);
    document.fillColor("#172c26").font("Helvetica-Bold").fontSize(10)
      .text(`${question.position}. ${answer ? letters[answer.number - 1] : "—"}`, answerStart + (question.position - 1) * answerWidth, summaryY + 9, { width: answerWidth, align: "center", lineBreak: false });
  }
  document.fillColor("#53665b").font("Helvetica").fontSize(8).text(`Total: ${formatPoints(data.total_points)} pontos`, pageMargin + width - 140, summaryY + 10, { width: 130, align: "right" });
  document.y += 43;

  for (const question of version.questions) {
    const correct = question.alternatives_snapshot.find((option) => option.is_correct);
    const explanation = question.explanation_snapshot?.trim();
    const estimate = 26 + (explanation ? textHeight(document, explanation, width - 18, "Helvetica", 8.5) : 0) + 8;
    if (document.y + estimate > document.page.height - pageMargin) {
      skipPageHeader.value = true;
      document.addPage();
      skipPageHeader.value = false;
      keyHeader(document, data, version);
      document.fillColor("#7a8a80").font("Helvetica-Oblique").fontSize(8).text("Continuação do gabarito", pageMargin, document.y, { width });
      document.moveDown(1);
    }
    document.fillColor("#1e5944").font("Helvetica-Bold").fontSize(10)
      .text(`Questão ${question.position} · ${correct ? letters[correct.number - 1] : "sem gabarito"} · ${formatPoints(question.points)} pontos`, pageMargin, document.y, { width });
    document.moveDown(0.25);
    document.fillColor("#53665b").font("Helvetica").fontSize(8)
      .text(`${question.question_type_name} · ${difficultyLabels[question.difficulty]}`, pageMargin, document.y, { width });
    if (explanation) {
      document.moveDown(0.35);
      document.fillColor("#34473e").font("Helvetica").fontSize(9).text(explanation, pageMargin + 8, document.y, { width: width - 8, lineGap: 1.2 });
    }
    document.moveDown(0.9);
  }
}

export async function createExamPackagePdf(data: ExamPackageSnapshot, kind: DocumentKind) {
  const { document, result } = makeDocument(`${data.title} · ${kind}`);
  const logo = kind === "provas"
    ? await readFile(join(process.cwd(), "public/branding/ifnmg-horizontal.png"))
    : null;
  let activeVersion: ExamVersionSnapshot | null = null;
  const skipPageHeader = { value: false };
  document.on("pageAdded", () => {
    drawPageFooter(document);
    if (kind === "provas" && activeVersion && !skipPageHeader.value) continuationHeader(document, data, activeVersion);
  });
  drawPageFooter(document);

  if (kind === "provas") {
    for (const [index, version] of data.versions.entries()) {
      if (index > 0) {
        activeVersion = null;
        skipPageHeader.value = true;
        document.addPage();
        skipPageHeader.value = false;
      }
      activeVersion = version;
      versionHeader(document, data, version, logo!);
      const [firstQuestion, ...remainingQuestions] = version.questions;
      if (firstQuestion) await drawStudentQuestion(document, firstQuestion, pageMargin, document.page.width - pageMargin * 2, true);
      if (remainingQuestions.length) {
        document.addPage();
        const columnGap = 20;
        const columnWidth = (document.page.width - pageMargin * 2 - columnGap) / 2;
        const columnX = [pageMargin, pageMargin + columnWidth + columnGap];
        const top = document.y;
        const bottom = document.page.height - pageMargin;
        const columnY = [top, top];
        for (const question of remainingQuestions) {
          const estimatedHeight = estimateQuestionHeight(document, question, columnWidth);
          let column = columnY[0] <= columnY[1] ? 0 : 1;
          if (columnY[column] + estimatedHeight > bottom && columnY[1 - column] + estimatedHeight <= bottom) column = 1 - column;
          if (columnY[column] + estimatedHeight > bottom) {
            document.addPage();
            columnY[0] = document.y;
            columnY[1] = document.y;
            column = 0;
          }
          document.y = columnY[column];
          await drawStudentQuestion(document, question, columnX[column], columnWidth, false);
          columnY[column] = document.y + 8;
        }
      }
    }
  } else {
    for (const [index, version] of data.versions.entries()) {
      if (index > 0) {
        skipPageHeader.value = true;
        document.addPage();
        skipPageHeader.value = false;
      }
      drawAnswerKey(document, data, version, skipPageHeader);
    }
  }

  document.end();
  return result;
}
