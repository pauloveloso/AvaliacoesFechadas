"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./question-context-layout.module.css";

export type QuestionContextOption = {
  periodId: string;
  periodName: string;
  disciplineId: string;
  disciplineName: string;
  contentId: string;
  contentName: string;
  questionTypeId: string;
  questionTypeName: string;
};

type Props = {
  options: QuestionContextOption[];
  selected: { periodId?: string; disciplineId?: string; contentId?: string; questionTypeId?: string };
};

function uniqueOptions<T extends { id: string; name: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export function QuestionContextSelector({ options, selected }: Props) {
  const initialPeriod = selected.periodId ?? "";
  const [periodId, setPeriodId] = useState(initialPeriod);
  const initialDiscipline = selected.disciplineId ?? "";
  const [disciplineId, setDisciplineId] = useState(initialDiscipline);
  const initialContent = selected.contentId ?? "";
  const [contentId, setContentId] = useState(initialContent);
  const [questionTypeId, setQuestionTypeId] = useState(selected.questionTypeId ?? "");

  useEffect(() => {
    setPeriodId(selected.periodId ?? "");
    setDisciplineId(selected.disciplineId ?? "");
    setContentId(selected.contentId ?? "");
    setQuestionTypeId(selected.questionTypeId ?? "");
  }, [selected.periodId, selected.disciplineId, selected.contentId, selected.questionTypeId]);

  const periods = useMemo(() => uniqueOptions(options.map(({ periodId: id, periodName: name }) => ({ id, name }))), [options]);
  const disciplines = uniqueOptions(options.filter((item) => item.periodId === periodId).map(({ disciplineId: id, disciplineName: name }) => ({ id, name })));
  const contents = uniqueOptions(options.filter((item) => item.periodId === periodId && item.disciplineId === disciplineId).map(({ contentId: id, contentName: name }) => ({ id, name })));
  const questionTypes = uniqueOptions(options.filter((item) => item.periodId === periodId && item.disciplineId === disciplineId && item.contentId === contentId).map(({ questionTypeId: id, questionTypeName: name }) => ({ id, name })));

  function changePeriod(value: string) {
    setPeriodId(value);
    setDisciplineId("");
    setContentId("");
    setQuestionTypeId("");
  }

  function changeDiscipline(value: string) {
    setDisciplineId(value);
    setContentId("");
    setQuestionTypeId("");
  }

  function changeContent(value: string) {
    setContentId(value);
    setQuestionTypeId("");
  }

  return (
    <form action="/questoes" method="get" autoComplete="off" className={`${styles.bar} question-context question-context-selector`}>
      <input type="hidden" name="periodId" value={periodId} />
      <input type="hidden" name="disciplineId" value={disciplineId} />
      <input type="hidden" name="contentId" value={contentId} />
      <input type="hidden" name="questionTypeId" value={questionTypeId} />
      <label className={`${styles.field} question-context-field`}>
        <span className={styles.label}>Período</span>
        <select name="periodPicker" className={styles.select} autoComplete="off" value={periodId} onChange={(event) => changePeriod(event.target.value)} required>
          <option value="">Selecione...</option>
          {periods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className={`${styles.field} question-context-field`}>
        <span className={styles.label}>Disciplina</span>
        <select name="disciplinePicker" className={styles.select} autoComplete="off" value={disciplineId} onChange={(event) => changeDiscipline(event.target.value)} required disabled={!periodId}>
          <option value="">Selecione...</option>
          {disciplines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className={`${styles.field} question-context-field`}>
        <span className={styles.label}>Conteúdo</span>
        <select name="contentPicker" className={styles.select} autoComplete="off" value={contentId} onChange={(event) => changeContent(event.target.value)} required disabled={!disciplineId}>
          <option value="">Selecione...</option>
          {contents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className={`${styles.field} question-context-field`}>
        <span className={styles.label}>Tipo de questão</span>
        <select name="questionTypePicker" className={styles.select} autoComplete="off" value={questionTypeId} onChange={(event) => setQuestionTypeId(event.target.value)} required disabled={!contentId}>
          <option value="">Selecione...</option>
          {questionTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <button className={styles.button} type="submit" disabled={!periodId || !disciplineId || !contentId || !questionTypeId}>Confirmar escolha</button>
    </form>
  );
}
