import type { QRCode } from "jsqr";

import type { CorrectionQrPayload } from "./qr-payload";

export type BubbleConfidence = "high" | "review" | "blank" | "multiple";
export type ScannedAnswer = {
  selectedOption: number | null;
  confidence: BubbleConfidence;
  confidenceScore: number;
};

type Point = { x: number; y: number };

function solveLinearSystem(matrix: number[][], values: number[]) {
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  const size = values.length;
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) throw new Error("A foto não permite alinhar a folha. Tente fotografar de mais perto e sem tremor.");
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let entry = column; entry <= size; entry++) augmented[column][entry] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let entry = column; entry <= size; entry++) augmented[row][entry] -= factor * augmented[column][entry];
    }
  }
  return augmented.map((row) => row[size]);
}

function perspectiveTransform(sourcePoints: Point[], targetPoints: Point[]) {
  const matrix: number[][] = [];
  const values: number[] = [];
  sourcePoints.forEach((source, index) => {
    const target = targetPoints[index];
    matrix.push([source.x, source.y, 1, 0, 0, 0, -target.x * source.x, -target.x * source.y]);
    values.push(target.x);
    matrix.push([0, 0, 0, source.x, source.y, 1, -target.y * source.x, -target.y * source.y]);
    values.push(target.y);
  });
  return solveLinearSystem(matrix, values);
}

function mapToSource(transform: number[], target: Point): Point {
  // Invert the source-to-target homography for this target point by solving
  // the corresponding two linear equations.
  const [a, b, c, d, e, f, g, h] = transform;
  const matrix = [
    [a - target.x * g, b - target.x * h],
    [d - target.y * g, e - target.y * h],
  ];
  const result = solveLinearSystem(matrix, [target.x - c, target.y - f]);
  return { x: result[0], y: result[1] };
}

function sampleGray(imageData: ImageData, point: Point, halfSize = 2) {
  let total = 0;
  let count = 0;
  const centerX = Math.round(point.x);
  const centerY = Math.round(point.y);
  for (let y = centerY - halfSize; y <= centerY + halfSize; y++) {
    for (let x = centerX - halfSize; x <= centerX + halfSize; x++) {
      if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) continue;
      const offset = (y * imageData.width + x) * 4;
      total += imageData.data[offset] * 0.299 + imageData.data[offset + 1] * 0.587 + imageData.data[offset + 2] * 0.114;
      count++;
    }
  }
  return count ? total / count : 255;
}

function median(values: number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length * 0.72)] ?? 220;
}

function decideAnswer(brightness: number[]): ScannedAnswer {
  const background = median(brightness);
  const cutoff = Math.max(75, Math.min(175, background - 62));
  const marked = brightness.map((value, index) => ({ index, value })).filter((item) => item.value < cutoff).sort((left, right) => left.value - right.value);
  if (marked.length > 1) return { selectedOption: null, confidence: "multiple", confidenceScore: 0 };
  if (marked.length === 1) {
    const darkest = marked[0];
    const runnerUp = Math.min(...brightness.filter((_, index) => index !== darkest.index));
    const separation = runnerUp - darkest.value;
    return {
      selectedOption: darkest.index + 1,
      confidence: darkest.value < cutoff - 28 && separation >= 38 ? "high" : "review",
      confidenceScore: Math.max(0, Math.min(1, separation / 120)),
    };
  }
  const darkest = Math.min(...brightness);
  if (darkest < cutoff + 28) return { selectedOption: null, confidence: "review", confidenceScore: 0 };
  return { selectedOption: null, confidence: "blank", confidenceScore: 1 };
}

export async function analyzeAnswerGrid(imageData: ImageData, qr: QRCode, payload: CorrectionQrPayload) {
  // Current printed QR is 88 pt, rasterized here at 4 px/pt, with a 2-module quiet zone.
  const qrSize = 88 * 4;
  const moduleCount = 17 + qr.version * 4;
  const modulePixels = qrSize / (moduleCount + 4);
  const quietZone = modulePixels * 2;
  const symbolEnd = quietZone + modulePixels * moduleCount;
  const qrLeft = 17;
  const questionCount = payload.correctOptions.length;
  const alternativeRowCount = Math.max(5, ...payload.alternativeCounts);
  const cardHeight = Math.max(140, 58 + alternativeRowCount * 11.4);
  const qrTop = (cardHeight - 65) / 2;
  const { topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner } = qr.location;
  const transform = perspectiveTransform(
    [topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner],
    [
      { x: (qrLeft * 4) + quietZone, y: (qrTop * 4) + quietZone },
      { x: (qrLeft * 4) + symbolEnd, y: (qrTop * 4) + quietZone },
      { x: (qrLeft * 4) + symbolEnd, y: (qrTop * 4) + symbolEnd },
      { x: (qrLeft * 4) + quietZone, y: (qrTop * 4) + symbolEnd },
    ],
  );
  const sampleAt = (x: number, y: number, radius = 2) => sampleGray(imageData, mapToSource(transform, { x: x * 4, y: y * 4 }), radius);

  const tableRight = 511.28 - 14;
  const questionStart = 156;
  const markerBottom = cardHeight - 10.5;
  const markers = [
    { x: questionStart + 5.5, y: 49.5 }, { x: tableRight - 5.5, y: 49.5 },
    { x: questionStart + 5.5, y: markerBottom }, { x: tableRight - 5.5, y: markerBottom },
  ];
  const markerContrasts = markers.map(({ x, y }) => sampleAt(x, y, 2) - sampleAt(x, y, 6));
  if (markerContrasts.some((contrast) => contrast < 32)) {
    throw new Error("Não consegui localizar as quatro marcas de alinhamento. Fotografe a prova inteira, sem cortar o cartão de respostas.");
  }

  const rowStart = 56;
  const rowEnd = cardHeight - 22;
  const questionColumnWidth = (tableRight - questionStart) / questionCount;
  const readings = payload.alternativeCounts.map((optionCount, question) => {
    const questionX = questionStart + questionColumnWidth * (question + 0.5);
    const brightness = Array.from({ length: optionCount }, (_, option) => {
      const rowY = rowStart + ((rowEnd - rowStart) * option) / (alternativeRowCount - 1);
      return sampleAt(questionX, rowY, 2);
    });
    return decideAnswer(brightness);
  });
  return { readings, markerContrasts };
}
