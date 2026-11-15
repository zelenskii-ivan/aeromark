"use client";

import { useState } from "react";
import { READING_TEXTS } from "@/content/karaoke/texts";
import { metrics, recommend, type ReadingRun } from "@/lib/karaoke/model";
import "./karaoke.css";

export function ParentKaraoke({ runs }: { runs: ReadingRun[] }) {
  const [filter, setFilter] = useState("all");
  const visible = runs.filter(r => filter === "all" || r.textId === filter);
  const checked = visible.filter(r => metrics(r));
  const seconds = visible.reduce((sum, r) => sum + r.elapsedMs / 1000, 0);
  return <section className="panel kr-screen">
    <span className="eyebrow">РОДИТЕЛЮ · ЧТЕНИЕ-КАРАОКЕ</span><h2>Практика, точность и понимание</h2>
    <p>Заданный темп подсветки не равен скорости чтения. Замеры ниже подтверждены взрослым; паузы исключены.</p>
    <label>Рассказ <select aria-label="Рассказ в аналитике" value={filter} onChange={e => setFilter(e.target.value)}>
      <option value="all">Все рассказы</option>{READING_TEXTS.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
    </select></label>
    <div className="kr-summary"><span><b>{visible.length}</b>занятий</span><span><b>{Math.round(seconds / 60 * 10) / 10}</b>минут практики</span><span><b>{checked.length}</b>замеров взрослого</span></div>
    {!runs.length && <p>Откройте «Академия пилотов → Чтение-караоке». После первого занятия здесь появится история.</p>}
    {filter !== "all" && <p>{recommend(runs, filter).message}</p>}
    <div className="kr-history">{visible.slice(-12).reverse().map(run => {
      const score = metrics(run);
      const prior = runs.slice(0, runs.indexOf(run)).filter(r => r.textId === run.textId).length;
      return <article key={run.id}>
        <strong>{READING_TEXTS.find(t => t.id === run.textId)?.title ?? run.textId}</strong>
        <p>{new Date(run.date).toLocaleString("ru-RU")} · {prior ? `Повтор, попытка ${prior + 1}` : "Первое чтение в сохранённой истории"} · {run.mode === "manual" ? "Свой темп" : run.mode === "syllables" ? "Подсветка слогов" : "Подсветка слов"}</p>
        <p>{(run.elapsedMs / 1000).toFixed(1)} с · {score ? `${run.attempted}/${run.totalWords} слов · ошибок: ${run.errors.length} · ${score.wpm.toFixed(1)} слов/мин · ${score.wcpm.toFixed(1)} верных слов/мин · ${(score.accuracy * 100).toFixed(1)}% точность` : "Практика без подтверждённого замера"}</p>
        <p>Понимание: {run.answers.length ? `${run.answers.filter(Boolean).length} из ${run.answers.length} отвеченных вопросов` : "вопросы пропущены"}.</p>
        {run.elapsedMs < 5000 && <p>Короткая попытка: скорость не используем для адаптации.</p>}
      </article>;
    })}</div>
    <p className="fine-print">Хранятся последние 60 занятий; показаны последние 12 по выбранному фильтру. Сравнивайте одинаковые тексты и условия. Рост на знакомом рассказе не доказывает перенос навыка: попробуйте новый текст без подсветки. Общий экспорт и семейная синхронизация включают этот журнал.</p>
  </section>;
}
