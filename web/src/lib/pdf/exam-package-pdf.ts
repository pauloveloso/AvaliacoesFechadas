import { get } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
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
export type ExamVersionSnapshot = { version_number: number; version_label: string; qr_token: string; questions: ExamQuestionSnapshot[] };
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

function buildOfflineQrPayload(version: ExamVersionSnapshot) {
  // QR schema v1: `a` has the 1-based correct option per question (0 if absent),
  // `c` has each question's alternative count, and `p` has points in cents.
  const questions = [...version.questions].sort((left, right) => left.position - right.position);
  const answers = questions.map((question) =>
    String(question.alternatives_snapshot.find((option) => option.is_correct)?.number ?? 0),
  ).join("");
  const alternativeCounts = questions.map((question) =>
    String(question.alternatives_snapshot.length),
  ).join("");
  const pointsInCents = questions.map((question) => Math.round(Number(question.points) * 100));

  return JSON.stringify({ v: 1, g: 2, t: version.qr_token, a: answers, c: alternativeCounts, p: pointsInCents });
}

function drawAnswerCard(
  document: PDFKit.PDFDocument,
  questionCount: number,
  qr: Buffer,
  x: number,
  y: number,
  width: number,
  alternativeCounts: number[],
) {
  const alternativeRowCount = Math.max(5, ...alternativeCounts);
  const cardHeight = Math.max(140, 58 + alternativeRowCount * 11.4);
  const qrColumnWidth = 122;
  const dividerX = x + qrColumnWidth;
  const tableX = dividerX + 12;
  const tableRight = x + width - 14;
  const alternativeLabelWidth = 22;
  const questionStart = tableX + alternativeLabelWidth;
  const questionColumnWidth = (tableRight - questionStart) / questionCount;
  const firstRowY = y + 56;
  const lastRowY = y + cardHeight - 22;
  const rowStep = alternativeRowCount > 1
    ? (lastRowY - firstRowY) / (alternativeRowCount - 1)
    : 0;

  document.roundedRect(x, y, width, cardHeight, 4)
    .lineWidth(1.2).fillAndStroke("#ffffff", "#263d30");
  document.fillColor("#14271e").font("Helvetica-Bold").fontSize(9.5)
    .text("CARTÃO DE RESPOSTAS", x + 10, y + 7, { lineBreak: false });
  document.fillColor("#263d30").font("Helvetica").fontSize(8.3)
    .text("Pinte completamente uma bolha por questão.", x + 10, y + 19, { lineBreak: false });
  document.moveTo(x + 1, y + 31).lineTo(x + width - 1, y + 31)
    .strokeColor("#52675a").lineWidth(0.8).stroke();
  document.moveTo(dividerX, y + 32).lineTo(dividerX, y + cardHeight - 1)
    .strokeColor("#52675a").lineWidth(0.8).stroke();

  const qrSize = 88;
  const qrY = y + (31 + cardHeight - 8 - qrSize) / 2;
  document.image(qr, x + (qrColumnWidth - qrSize) / 2, qrY, { width: qrSize, height: qrSize });

  document.fillColor("#14271e").font("Helvetica-Bold").fontSize(7.5)
    .text("ALT.", tableX, y + 37, { width: alternativeLabelWidth, align: "center", lineBreak: false });
  for (let question = 0; question < questionCount; question++) {
    document.fillColor("#14271e").font("Helvetica-Bold").fontSize(7.5)
      .text(String(question + 1), questionStart + question * questionColumnWidth, y + 37, {
        width: questionColumnWidth,
        align: "center",
        lineBreak: false,
      });
  }

  const markerSize = 7;
  const markerLeft = questionStart + 2;
  const markerRight = tableRight - markerSize - 2;
  const topMarkerY = y + 46;
  const bottomMarkerY = y + cardHeight - 14;
  for (const markerX of [markerLeft, markerRight]) {
    document.rect(markerX, topMarkerY, markerSize, markerSize).fill("#111111");
    document.rect(markerX, bottomMarkerY, markerSize, markerSize).fill("#111111");
  }

  document.fillColor("#14271e").font("Helvetica-Bold").fontSize(8.5);
  for (let alternative = 0; alternative < alternativeRowCount; alternative++) {
    const rowY = firstRowY + rowStep * alternative;
    document.text(letters[alternative], tableX, rowY - 4.5, {
      width: alternativeLabelWidth,
      align: "center",
      lineBreak: false,
    });
    for (let question = 0; question < questionCount; question++) {
      if (alternative >= (alternativeCounts[question] ?? 8)) continue;
      const centerX = questionStart + questionColumnWidth * (question + 0.5);
      document.circle(centerX, rowY, 4.2).lineWidth(0.85).strokeColor("#172c22").stroke();
    }
  }

  return cardHeight;
}

function versionHeader(document: PDFKit.PDFDocument, data: ExamPackageSnapshot, logo: Buffer, qr: Buffer, version: ExamVersionSnapshot) {
  const width = document.page.width - pageMargin * 2;
  const logoWidth = 148;
  const logoHeight = logoWidth * 335 / 993;
  const logoY = pageMargin;
  document.image(logo, pageMargin, logoY, { fit: [logoWidth, logoHeight] });
  document.fillColor("#172c26").font("Helvetica-Bold").fontSize(18)
    .text("Campus Januária", pageMargin + logoWidth + 12, logoY + logoHeight / 2 - 10, {
      width: width - logoWidth - 24,
      align: "center",
      lineBreak: false,
    });

  const institutionRuleY = logoY + logoHeight + 9;
  document.moveTo(pageMargin, institutionRuleY).lineTo(pageMargin + width, institutionRuleY)
    .strokeColor("#18251f").lineWidth(0.8).stroke();

  const activityY = institutionRuleY + 8;
  document.fillColor("#172c26").font("Helvetica-Bold").fontSize(17)
    .text(`Atividade Avaliativa de ${data.discipline}`, pageMargin, activityY, { width, align: "center" });

  const nameY = document.y + 8;
  const nameWidth = width * 0.72;
  const fieldsGap = 14;
  const classX = pageMargin + nameWidth + fieldsGap;
  const classWidth = width - nameWidth - fieldsGap;
  document.fillColor("#172c26").font("Helvetica-Bold").fontSize(9)
    .text("Nome:", pageMargin, nameY)
    .moveTo(pageMargin + 31, nameY + 13).lineTo(pageMargin + nameWidth, nameY + 13).strokeColor("#8e9d95").lineWidth(0.6).stroke();
  document.text("Turma:", classX, nameY)
    .moveTo(classX + 37, nameY + 13).lineTo(classX + classWidth, nameY + 13).strokeColor("#8e9d95").lineWidth(0.6).stroke();

  const instructionY = nameY + 23;
  const instructionText = "Preencha o cartão de respostas à caneta preta ou azul. Pinte uma bolha por questão.";
  document.fillColor("#172c26").font("Helvetica-Bold").fontSize(9)
    .text("Instruções: ", pageMargin, instructionY, { width, continued: true, lineBreak: false });
  document.fillColor("#172c26").font("Helvetica").fontSize(9)
    .text(instructionText, { width, lineGap: 1.2 });
  let answerY = document.y + 5;
  if (data.instructions.trim()) {
    document.fillColor("#172c26").font("Helvetica-Bold").fontSize(9)
      .text(`Instrução específica: `, pageMargin, answerY, { width, continued: true, lineBreak: false });
    document.fillColor("#172c26").font("Helvetica").fontSize(9)
      .text(data.instructions, { width, lineGap: 1.2 });
    answerY = document.y + 5;
  }

  const responseCardHeight = drawAnswerCard(
    document,
    version.questions.length,
    qr,
    pageMargin,
    answerY,
    width,
    version.questions.map((question) => question.alternatives_snapshot.length),
  );
  const contentRuleY = answerY + responseCardHeight + 9;
  document.moveTo(pageMargin, contentRuleY).lineTo(pageMargin + width, contentRuleY).strokeColor("#87968e").lineWidth(0.65).stroke();
  document.y = contentRuleY + 10;
}

function continuationHeader(document: PDFKit.PDFDocument, data: ExamPackageSnapshot) {
  const width = document.page.width - pageMargin * 2;
  document.fillColor("#172c26").font("Helvetica-Bold").fontSize(10)
    .text(`Atividade Avaliativa de ${data.discipline}`, pageMargin, 30, { width, align: "center" });
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
    total + (line.text.trim() ? textHeight(document, line.text, width, line.code ? "Courier-Bold" : "Helvetica", line.code ? 8 : 9.5) : 2), 0);
}

function estimateQuestionHeight(document: PDFKit.PDFDocument, question: ExamQuestionSnapshot, width: number) {
  const alternatives = question.alternatives_snapshot.reduce((total, option) =>
    total + textHeight(document, option.text, width - 24, "Helvetica", 9.5) + 5, 0);
  return 25 + statementHeight(document, getStatementText(question), width) + 5 +
    question.images_snapshot.length * 150 + alternatives + 4;
}

function drawStatement(document: PDFKit.PDFDocument, statement: string, x: number, width: number) {
  for (const line of getCodeLines(statement)) {
    if (!line.text.trim()) {
      document.moveDown(0.12);
      continue;
    }
    const font = line.code ? "Courier-Bold" : "Helvetica";
    const fontSize = line.code ? 8 : 9.5;
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
  document.roundedRect(x, y, width, 23, 4).fillAndStroke("#e4eee7", "#75877c");
  document.fillColor("#14271e").font("Helvetica-Bold").fontSize(9)
    .text(`QUESTÃO ${question.position}`, x + 8, y + 6, { width: 85 });
  document.fillColor("#14271e").font("Helvetica-Bold").fontSize(8.5)
    .text(`${formatPoints(question.points)} pts`, x + width - 60, y + 6, { width: 52, align: "right" });
  document.y = y + 30;
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
    const text = `${letters[option.number - 1]}.  ${option.text}`;
    document.fillColor("#172c22").font("Helvetica").fontSize(9.5)
      .text(text, x, document.y + 2, { width, lineGap: 0.8 });
    document.moveDown(0.1);
  }
  document.moveDown(0.25);
}

async function drawQuestionsInColumns(document: PDFKit.PDFDocument, questions: ExamQuestionSnapshot[]) {
  const columnGap = 20;
  const contentWidth = document.page.width - pageMargin * 2;
  const columnWidth = (contentWidth - columnGap) / 2;
  const columnX = [pageMargin, pageMargin + columnWidth + columnGap];
  const bottom = document.page.height - pageMargin;
  let columnY = [document.y, document.y];

  const drawColumnDivider = (top: number) => {
    document.save();
    document.moveTo(pageMargin + columnWidth + columnGap / 2, top)
      .lineTo(pageMargin + columnWidth + columnGap / 2, bottom)
      .strokeColor("#8c9990").lineWidth(0.8).stroke();
    document.restore();
  };

  drawColumnDivider(document.y - 2);

  for (const question of questions) {
    const estimatedHeight = estimateQuestionHeight(document, question, columnWidth);
    let column = columnY[0] <= columnY[1] ? 0 : 1;
    if (columnY[column] + estimatedHeight > bottom && columnY[1 - column] + estimatedHeight <= bottom) {
      column = 1 - column;
    }
    if (columnY[column] + estimatedHeight > bottom) {
      document.addPage();
      columnY = [document.y, document.y];
      column = 0;
      drawColumnDivider(document.y - 2);
    }

    document.y = columnY[column];
    await drawStudentQuestion(document, question, columnX[column], columnWidth, false);
    columnY[column] = document.y + 8;
  }
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
      .text(difficultyLabels[question.difficulty], pageMargin, document.y, { width });
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
  const qrCodes = kind === "provas"
    ? await Promise.all(data.versions.map((version) => QRCode.toBuffer(
      buildOfflineQrPayload(version),
      { errorCorrectionLevel: "H", margin: 2, width: 512 },
    )))
    : [];
  const skipPageHeader = { value: false };
  document.on("pageAdded", () => {
    drawPageFooter(document);
    if (kind === "provas" && !skipPageHeader.value) continuationHeader(document, data);
  });
  drawPageFooter(document);

  if (kind === "provas") {
    for (const [index, version] of data.versions.entries()) {
      if (index > 0) {
        skipPageHeader.value = true;
        document.addPage();
        skipPageHeader.value = false;
      }
      versionHeader(document, data, logo!, qrCodes[index], version);
      await drawQuestionsInColumns(document, version.questions);
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
