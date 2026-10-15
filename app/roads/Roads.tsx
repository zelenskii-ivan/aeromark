'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Star, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ROAD_TASKS, TOPICS, correctRoadAnswer, taskById, type RoadTask } from '@/content/roads/tasks';
import { answerRoad, mistakeIds, nextRoadTask, roadStars, startRoadRun, type Roads as RoadState } from '@/lib/roads/state';
import { cancelSpeech, hasRussianVoice, prepareSpeech, speakText } from '@/lib/speech';
import { Scene } from './Scenes';
import './roads.css';

type Props = { state: RoadState; update: (fn: (state: RoadState) => RoadState) => void; pilotName: string; onExit: () => void };
export function Roads({ state, update, pilotName, onExit }: Props) {
  const [training, setTraining] = useState(false);
  useEffect(() => cancelSpeech, [training]);
  const run = state.active;
  const task = run ? taskById(run.queue[run.index] ?? '') : undefined;
  const stars = roadStars(state);
  const mistakes = mistakeIds(state);
  return <main className="roads">
    <header className="road-header"><Button variant="outline" onClick={() => training ? setTraining(false) : onExit()}><ChevronLeft/>{training ? 'К карте' : 'В AeroMark'}</Button><span><Star size={20}/> {stars} / {ROAD_TASKS.length}</span></header>
    <div><span className="road-eyebrow">ШКОЛА ЮНОГО ПЕШЕХОДА · 1 КЛАСС</span><h1>Безопасные дороги</h1><p>{pilotName}, учимся замечать опасности и выбирать безопасный путь.</p></div>
    {training && run ? task ? <Exercise key={`${run.index}:${task.id}`} task={task} picked={run.picked} position={run.index + 1} total={run.queue.length} onAnswer={picked => update(current => answerRoad(current, task.id, picked))} onNext={() => update(nextRoadTask)}/> : <section className="road-card" aria-live="polite"><h2>Тренировка завершена!</h2><p>Верных ответов: {run.right} из {run.queue.length}. {run.right === run.queue.length ? 'Отличная внимательность!' : 'Ошибки помогают учиться. Повторим трудные ситуации?'}</p><p>Звезда выдаётся за первое верное решение каждой задачи.</p><Button onClick={() => setTraining(false)}>Выбрать тренировку</Button></section> : <>
      <section className="road-card road-intro"><h2>Твой дорожный маршрут</h2><p>Три уровня, пять тем, без таймера. Занимайся сколько хочешь. Все уровни доступны сразу.</p><p className="road-notice">Подготовка по темам олимпиады Учи.ру «Безопасные дороги» 2026. Авторские тренировочные задания AeroMark, не официальные задания олимпиады.</p></section>
      {run && run.index < run.queue.length && <Button size="lg" onClick={() => setTraining(true)}>Продолжить: задание {run.index + 1} из {run.queue.length}</Button>}
      <div className="road-levels">{['Первые шаги', 'Внимательный пешеход', 'Дорожный исследователь'].map((title, index) => {
        const tasks = ROAD_TASKS.filter(t => t.level === index + 1);
        const earned = tasks.filter(t => state.items[t.id]?.earned).length;
        return <section className="road-card" key={title}><span className="road-eyebrow">УРОВЕНЬ {index + 1}</span><h2>{title}</h2><p>{index === 0 ? 'Узнаём правила и знаки' : index === 1 ? 'Собираем шаги и выбираем решения' : 'Замечаем скрытые опасности'}</p><Progress value={earned / tasks.length * 100} aria-label={`Освоено ${earned} из ${tasks.length}`}/><p>Звёзд: {earned} из {tasks.length}</p><Button onClick={() => { update(s => startRoadRun(s, index + 1)); setTraining(true); }}>Тренироваться</Button></section>;
      })}</div>
      <section className="road-card"><h2>Повторение ошибок</h2><p>{mistakes.length ? `Ждут повторения: ${mistakes.length}. После верного решения ситуация исчезнет из этого списка.` : 'Пока нет ошибок для повторения. Можно выбрать любой уровень.'}</p><Button disabled={!mistakes.length} onClick={() => { update(s => startRoadRun(s, 'mistakes')); setTraining(true); }}>Повторить ошибки</Button></section>
      <section className="road-card"><h2>Награды штурмана</h2><div className="road-badges">{Object.entries(TOPICS).map(([topic, title]) => { const mastered = ROAD_TASKS.filter(t => t.topic === topic).every(t => state.items[t.id]?.earned); return <span key={topic} className={mastered ? 'earned' : ''}>{mastered ? '★' : '☆'} {title}</span>; })}</div><p>Собери три звезды в теме, чтобы получить значок. Завершено тренировок: {state.runs}.</p></section>
      <p className="road-notice">Прогресс входит в общее сохранение AeroMark. Подключение к семейному кабинету и состояние синхронизации — в разделе «Для взрослого». В жизни отрабатывайте маршрут вместе с взрослым.</p>
    </>}
  </main>;
}
function Exercise({ task, picked, position, total, onAnswer, onNext }: { task: RoadTask; picked: number[] | null; position: number; total: number; onAnswer: (picked: number[]) => void; onNext: () => void }) {
  const [selection, setSelection] = useState<number[]>([]);
  const [voiceMessage, setVoiceMessage] = useState('');
  const submitted = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); return cancelSpeech; }, []);
  const checked = picked !== null;
  const chosen = picked ?? selection;
  const correct = checked && correctRoadAnswer(task, picked);
  const read = (text: string, slow = false) => {
    if (!('speechSynthesis' in window) || !hasRussianVoice()) { setVoiceMessage('Русский голос недоступен. Включите русский голос в настройках устройства или попросите взрослого прочитать текст.'); return; }
    setVoiceMessage(''); speakText(prepareSpeech(text), slow);
  };
  const choose = (index: number) => {
    if (checked) return;
    setSelection(old => task.kind === 'choice' ? [index] : old.includes(index) ? old.filter(i => i !== index) : [...old, index]);
  };
  const speech = `${task.prompt} ${task.options.map((option, i) => `Вариант ${i + 1}. ${option}.`).join(' ')}`;
  return <section className="road-card road-exercise">
    <p>{TOPICS[task.topic]} · Задание {position} из {total}</p><Progress value={(position - 1) / total * 100} aria-label="Прогресс тренировки"/>
    <Scene scene={task.scene}/><h2 ref={heading} tabIndex={-1}>{task.prompt}</h2>
    <div className="road-audio"><Button variant="outline" onClick={() => read(speech)}><Volume2/>Слушать</Button><Button variant="outline" onClick={() => read(speech, true)}>Медленнее</Button><Button variant="ghost" onClick={cancelSpeech}>Остановить звук</Button></div>
    {voiceMessage && <p role="status">{voiceMessage}</p>}
    <p>{task.kind === 'multi' ? 'Отметь все подходящие ответы и нажми «Проверить».' : task.kind === 'order' ? 'Нажми все шаги в нужном порядке. Нажми выбранный шаг ещё раз, чтобы убрать его.' : 'Выбери один ответ и нажми «Проверить».'}</p>
    <div className="road-options">{task.options.map((option, index) => <button key={option} type="button" aria-pressed={chosen.includes(index)} disabled={checked} onClick={() => choose(index)} className={chosen.includes(index) ? 'selected' : ''}><span>{task.kind === 'order' && chosen.includes(index) ? `${chosen.indexOf(index) + 1}. ` : ''}{option}</span></button>)}</div>
    {!checked ? <Button size="lg" disabled={!selection.length || (task.kind === 'order' && selection.length !== task.options.length)} onClick={() => { if (submitted.current) return; submitted.current = true; cancelSpeech(); onAnswer(selection); }}>Проверить</Button> : <div className={`road-feedback ${correct ? 'correct' : ''}`} role="status"><h3>{correct ? 'Верно! ★' : 'Давай разберёмся'}</h3><p>{task.explanation}</p><p><strong>{task.kind === 'order' ? 'Порядок: ' : 'Верное решение: '}</strong>{task.answer.map(i => task.options[i]).join(task.kind === 'order' ? ' → ' : '; ')}</p><div className="road-audio"><Button variant="outline" onClick={() => read(task.explanation)}>Послушать объяснение</Button><Button onClick={() => { cancelSpeech(); onNext(); }}>{position === total ? 'К результату' : 'Дальше'}</Button></div></div>}
  </section>;
}
