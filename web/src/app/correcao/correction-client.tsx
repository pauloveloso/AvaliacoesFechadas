"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

import { analyzeAnswerGrid, type ScannedAnswer } from "@/lib/correction/analyze-answer-grid";
import { parseCorrectionQrPayload, type CorrectionQrPayload } from "@/lib/correction/qr-payload";

type ScanState = "empty" | "processing" | "complete";

const letters = "ABCDEFGH";

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não consegui abrir esta imagem. Escolha outra foto."));
    image.src = url;
  });
}

function formatPoints(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CorrectionClient() {
  const [scanState, setScanState] = useState<ScanState>("empty");
  const [error, setError] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [payload, setPayload] = useState<CorrectionQrPayload | null>(null);
  const [readings, setReadings] = useState<ScannedAnswer[]>([]);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [manualOverrides, setManualOverrides] = useState<(number | null | undefined)[]>([]);
  const [studentName, setStudentName] = useState("");
  const previousUrl = useRef("");

  useEffect(() => () => {
    if (previousUrl.current) URL.revokeObjectURL(previousUrl.current);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
    }
  }, []);

  async function processPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setPayload(null);
    setReadings([]);
    setAnswers([]);
    setManualOverrides([]);
    setScanState("processing");
    setPhotoName(file.name);
    if (previousUrl.current) URL.revokeObjectURL(previousUrl.current);
    const url = URL.createObjectURL(file);
    previousUrl.current = url;
    setPhotoUrl(url);

    try {
      const image = await loadImage(url);
      const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("O navegador não conseguiu preparar a foto para leitura.");
      context.drawImage(image, 0, 0, width, height);

      const imageData = context.getImageData(0, 0, width, height);
      const qr = jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" });
      if (!qr) throw new Error("Não encontrei o QR. Enquadre o cartão inteiro, aproxime a câmera e tente outra vez.");

      const parsedPayload = parseCorrectionQrPayload(qr.data);
      const result = await analyzeAnswerGrid(imageData, qr, parsedPayload);
      setPayload(parsedPayload);
      setReadings(result.readings);
      setAnswers(result.readings.map((reading) => reading.selectedOption));
      setManualOverrides(result.readings.map(() => undefined));
      setScanState("complete");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível corrigir esta foto.");
      setScanState("empty");
    }
  }

  const effectiveAnswers = answers.map((answer, index) =>
    manualOverrides[index] === undefined ? answer : manualOverrides[index] ?? null,
  );
  const earnedCents = payload
    ? effectiveAnswers.reduce<number>((total, answer, index) => total + (answer === payload.correctOptions[index] ? payload.pointsInCents[index] : 0), 0)
    : 0;
  const totalCents = payload ? payload.pointsInCents.reduce<number>((total, points) => total + points, 0) : 0;
  const correctCount = payload
    ? effectiveAnswers.filter((answer, index) => answer === payload.correctOptions[index]).length
    : 0;
  const reviewCount = readings.filter((reading, index) =>
    manualOverrides[index] === undefined && (reading.confidence === "review" || reading.confidence === "multiple"),
  ).length;

  return (
    <div className="correction-workspace">
      <section className="catalog-section correction-upload-card">
        <div className="catalog-section-heading">
          <span className="catalog-step">1</span>
          <div>
            <h2>Fotografe o cartão de respostas</h2>
            <p>Deixe visíveis o QR, as bolhas e as quatro marcas pretas. A foto é processada localmente e não é enviada.</p>
          </div>
        </div>

        <label className="correction-file-button">
          <span aria-hidden="true">▧</span>
          {scanState === "processing" ? "Lendo avaliação…" : "Tirar ou escolher foto"}
          <input type="file" accept="image/*" capture="environment" onChange={processPhoto} disabled={scanState === "processing"} />
        </label>
        {photoName ? <span className="correction-photo-name">{photoName}</span> : null}
        {error ? <p className="flash-message error correction-error" role="alert">{error}</p> : null}
        {scanState === "processing" ? <p className="correction-processing" role="status">Lendo o QR e alinhando as marcas do cartão…</p> : null}
      </section>

      {photoUrl ? (
        <section className="correction-photo-preview" aria-label="Foto selecionada">
          <img src={photoUrl} alt="Foto do cartão de respostas selecionada para correção" />
        </section>
      ) : null}

      {scanState === "complete" && payload ? (
        <section className="catalog-section correction-result-card">
          <div className="catalog-section-heading">
            <span className="catalog-step">2</span>
            <div>
              <h2>Revise e confirme a correção</h2>
              <p>O QR identificou {payload.correctOptions.length} questões. Confira respostas marcadas para revisão antes de registrar a nota.</p>
            </div>
          </div>

          <label className="correction-student-name">Nome do aluno
            <input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="Digite o nome que aparece na prova" />
          </label>

          <div className="correction-score-panel" aria-live="polite">
            <div><span>Nota</span><strong>{formatPoints(earnedCents)} <small>/ {formatPoints(totalCents)}</small></strong></div>
            <div><span>Questões corretas</span><strong>{correctCount} <small>/ {payload.correctOptions.length}</small></strong></div>
            <div><span>Revisar</span><strong>{reviewCount}</strong></div>
          </div>

          <div className="correction-answer-list">
            {payload.correctOptions.map((correctOption, index) => {
              const selectedOption = effectiveAnswers[index];
              const reading = readings[index];
              const isCorrect = selectedOption === correctOption;
              const unresolved = manualOverrides[index] === undefined &&
                (reading.confidence === "review" || reading.confidence === "multiple");
              const status = unresolved && reading.confidence === "multiple"
                ? "Mais de uma marca"
                : unresolved
                  ? "Revisar marcação"
                  : selectedOption === null
                    ? "Em branco"
                    : isCorrect ? "Correta" : "Incorreta";
              const statusClass = unresolved
                ? "needs-review"
                : selectedOption === null ? "is-blank" : isCorrect ? "is-correct" : "is-wrong";

              return (
                <article className={`correction-answer-row ${statusClass}`} key={index}>
                  <div className="correction-question-number">Questão {index + 1}</div>
                  <label>Resposta do aluno
                    <select
                      value={selectedOption ?? ""}
                      onChange={(event) => setManualOverrides((current) => current.map((answer, answerIndex) =>
                        answerIndex === index ? (event.target.value ? Number(event.target.value) : null) : answer,
                      ))}
                    >
                      <option value="">Em branco / não identificada</option>
                      {Array.from({ length: payload.alternativeCounts[index] }, (_, optionIndex) => (
                        <option key={optionIndex + 1} value={optionIndex + 1}>{letters[optionIndex]}</option>
                      ))}
                    </select>
                  </label>
                  <div className="correction-key-answer">Gabarito <strong>{letters[correctOption - 1]}</strong></div>
                  <div className="correction-points">{formatPoints(payload.pointsInCents[index])} pts</div>
                  <div className="correction-status">{status}</div>
                  {unresolved && selectedOption !== null ? (
                    <button className="correction-confirm-button" type="button" onClick={() => setManualOverrides((current) => current.map((answer, answerIndex) => answerIndex === index ? selectedOption : answer))}>
                      Confirmar leitura
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
          <p className="correction-local-note">A nota é calculada neste aparelho. Esta versão ainda não salva resultados no sistema.</p>
        </section>
      ) : null}
    </div>
  );
}
