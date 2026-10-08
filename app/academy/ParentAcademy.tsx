"use client";

import { SKILL_TITLE } from "@/content/academy/curriculum";
import { buildReport } from "@/lib/academy/report";
import type { Academy } from "@/lib/academy/state";
import { today } from "@/lib/progress";
import "./academy.css";

/**
 * Академия глазами взрослого: что пройдено, что усвоено, что тренировать.
 *
 * Только наблюдаемое: ответы, подсказки, замеры. Тренажёр не ставит
 * диагнозов — если что-то тревожит, это вопрос к учителю или логопеду.
 */

const pct = (value: number) => `${Math.round(value * 100)}%`;

const STATUS_TEXT = {
  new: "ещё не встречалась",
  learning: "в работе",
  practice: "нужна практика",
  mastered: "усвоена",
} as const;

export function ParentAcademy({ academy }: { academy: Academy }) {
  const report = buildReport(academy, today());
  const hasData = report.skills.some((skill) => skill.attempts > 0) || report.speed.length > 0;
  return (
    <section className="panel ac-parent">
      <span className="eyebrow">АКАДЕМИЯ ПИЛОТОВ · ЧТЕНИЕ</span>
      <h2>Как идёт чтение</h2>
      <p className="lead">
        Пройдено уроков: <b>{report.completed}</b> из {report.totalLessons}. Звёзд: {academy.stars}, монет: {academy.coins},
        дней подряд: {academy.streak}.
      </p>
      {!hasData ? (
        <p className="lead">Данных пока нет. Они появятся после первого полёта в Академии.</p>
      ) : (
        <>
          <h3 className="ac-parent-h">Навыки</h3>
          <div className="ac-skill-table" role="table" aria-label="Навыки чтения">
            <div role="row" className="head">
              <span role="columnheader">Навык</span>
              <span role="columnheader">Усвоено</span>
              <span role="columnheader">Точность</span>
              <span role="columnheader">С подсказкой</span>
            </div>
            {report.skills.map((skill) => (
              <div role="row" key={skill.skill}>
                <span role="cell">{SKILL_TITLE[skill.skill]}</span>
                <span role="cell">
                  {skill.seen ? `${skill.mastered} из ${skill.seen}` : "—"}
                  {skill.seen ? (
                    <i className="ac-meter" aria-hidden="true">
                      <i style={{ width: pct(skill.mastery) }} />
                    </i>
                  ) : null}
                </span>
                <span role="cell">{skill.attempts ? pct(skill.accuracy) : "—"}</span>
                <span role="cell">{skill.attempts ? pct(skill.hints / skill.attempts) : "—"}</span>
              </div>
            ))}
          </div>
          <p className="fine-print">
            «Усвоено» — единица несколько раз подряд прочитана верно без подсказки. Задания с подсказкой засчитываются, но
            к «усвоено» не продвигают.
          </p>

          <h3 className="ac-parent-h">Буквы</h3>
          <div className="ac-letter-grid">
            {report.letters.map((cell) => (
              <span
                key={cell.char}
                className={`ac-letter-cell ${cell.status}`}
                title={`${cell.char}: ${STATUS_TEXT[cell.status]}${cell.attempts ? `, точность ${pct(cell.accuracy)}` : ""}`}
              >
                {cell.char}
              </span>
            ))}
          </div>
          <p className="ac-legend">
            <span className="ac-letter-cell mastered">А</span> усвоена
            <span className="ac-letter-cell learning">А</span> в работе
            <span className="ac-letter-cell practice">А</span> нужна практика
            <span className="ac-letter-cell new">А</span> ещё не было
          </p>

          <h3 className="ac-parent-h">Понимание и подсказки</h3>
          <p className="lead">
            Вопросы к предложениям и рассказам: {report.comprehension.total ? `${report.comprehension.correct} из ${report.comprehension.total} верно с первой попытки` : "ещё не было"}.
            Подсказкой пользовались в {pct(report.hintRate)} заданий.
          </p>

          <h3 className="ac-parent-h">Скорость чтения</h3>
          {report.speed.length ? (
            <div className="ac-speed-table">
              <div className="head">
                <span>Дата</span>
                <span>Верных слов/мин</span>
                <span>Слов/мин</span>
                <span>Точность</span>
                <span>Вопросы</span>
              </div>
              <div className="baseline">
                <span>30.09 школа</span>
                <span>8</span>
                <span>—</span>
                <span>—</span>
                <span>—</span>
              </div>
              {report.speed.slice(-8).map((run, index) => (
                <div key={index}>
                  <span>
                    {run.date.slice(8, 10)}.{run.date.slice(5, 7)}
                  </span>
                  <span>
                    <b>{run.wcpm}</b>
                  </span>
                  <span>{run.wpm}</span>
                  <span>{run.accuracy}%</span>
                  <span>
                    {run.comprehension[0]}/{run.comprehension[1]}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="lead">Лётных тестов ещё не было. Школьный замер 30.09 — 8 слов в минуту.</p>
          )}

          {report.practice.length ? (
            <>
              <h3 className="ac-parent-h">Что потренировать</h3>
              <p className="lead">{report.practice.join(", ")}.</p>
            </>
          ) : null}
        </>
      )}
      <h3 className="ac-parent-h">Что дальше</h3>
      <ul className="ac-recs">
        {report.recommendations.map((rec) => (
          <li key={rec.title}>
            <b>{rec.title}.</b> {rec.text}
          </li>
        ))}
      </ul>
      <p className="fine-print">
        Тренажёр видит только нажатия на кнопки, а не чтение вслух. Цифры помогают заметить, где нужна практика, но не
        заменяют мнение учителя или логопеда.
      </p>
    </section>
  );
}
