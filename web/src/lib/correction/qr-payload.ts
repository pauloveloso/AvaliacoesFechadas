export type CorrectionQrPayload = {
  schemaVersion: 1;
  gridVersion: 2;
  token: string;
  correctOptions: number[];
  alternativeCounts: number[];
  pointsInCents: number[];
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCorrectionQrPayload(raw: string): CorrectionQrPayload {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("O QR não contém um gabarito Avalia válido.");
  }

  if (!value || typeof value !== "object") {
    throw new Error("O QR não contém um gabarito Avalia válido.");
  }

  const payload = value as Record<string, unknown>;
  if (payload.v !== 1 || payload.g !== 2) {
    throw new Error("Este QR usa uma versão de gabarito que o módulo ainda não reconhece. Gere novamente o PDF atualizado.");
  }
  if (typeof payload.t !== "string" || !uuidPattern.test(payload.t)) {
    throw new Error("O QR não contém um token de avaliação válido.");
  }
  if (typeof payload.a !== "string" || !/^[1-8]{1,10}$/.test(payload.a)) {
    throw new Error("O gabarito no QR não possui de 1 a 10 respostas válidas.");
  }
  if (typeof payload.c !== "string" || payload.c.length !== payload.a.length || !/^[2-8]{1,10}$/.test(payload.c)) {
    throw new Error("A quantidade de alternativas do QR está inválida.");
  }
  if (!Array.isArray(payload.p) || payload.p.length !== payload.a.length ||
      !payload.p.every((points) => Number.isInteger(points) && Number(points) > 0)) {
    throw new Error("Os valores das questões no QR estão inválidos.");
  }

  const correctOptions = [...payload.a].map(Number);
  const alternativeCounts = [...payload.c].map(Number);
  if (correctOptions.some((option, index) => option > alternativeCounts[index])) {
    throw new Error("O gabarito aponta para uma alternativa inexistente.");
  }

  return {
    schemaVersion: 1,
    gridVersion: 2,
    token: payload.t,
    correctOptions,
    alternativeCounts,
    pointsInCents: payload.p.map(Number),
  };
}
