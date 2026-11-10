import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Flag,
  Languages,
  PenLine,
} from "lucide-react";
import { createSaveQueue, deliverSave, nextDelay } from "./save-queue.js";
import { PracticeAudio, VoiceResponse } from "./PracticeMedia.jsx";
import {
  Breadcrumb,
  ErrorState,
  Loading,
  Locked,
  Modal,
  NotFound,
  mnCopy,
  Results,
  sectionText,
  testLabel,
  useApp,
  useResource,
} from "./App.jsx";

function Passage({ text }) {
  const lines = text.split("\n").filter((x) => x.trim());
  return (
    <div className="passage-text" lang="en">
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {i === 0 ? <h2>{line}</h2> : <span>{line} </span>}
          {i > 0 && /[.!?]$/.test(line.trim()) && (
            <>
              <br />
              <br />
            </>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function HelpSheet({ question, table, t }) {
  const prompt = mnCopy(question.prompt);
  const options = (question.options || [])
    .map((option) => mnCopy(option))
    .filter(Boolean);
  const hint = mnCopy(question.hint);
  if (!prompt && !options.length && !hint && !table) {
    return <p className="help-empty">{t.helpMissing}</p>;
  }
  return (
    <aside className="help-sheet" lang="mn">
      <p className="help-kicker">{t.helpBelow}</p>
      {prompt && <p className="help-prompt">{prompt}</p>}
      {table && (
        <div className="task-table">
          <table>
            <tbody>
              {table.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {options.length > 0 && (
        <ol className="help-options">
          {options.map((option, i) => (
            <li key={i}>
              <span>{"ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i]}</span>
              {option}
            </li>
          ))}
        </ol>
      )}
      {hint && <p className="help-hint">{hint}</p>}
      <small>{t.helpNote}</small>
    </aside>
  );
}

function Player({ initial, exam, onFinish }) {
  const { t, api, tr, session } = useApp();
  const navigate = useNavigate();
  const { test, runId, deadline, serverNow } = initial;
  const [answers, setAnswers] = useState(initial.answers),
    [index, setIndex] = useState(0),
    [help, setHelp] = useState(false),
    [flags, setFlags] = useState(new Set()),
    [saveStatus, setSaveStatus] = useState("saved"),
    [seconds, setSeconds] = useState(
      Math.max(0, Math.ceil((deadline - serverNow) / 1000)),
    ),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const answersRef = useRef(answers),
    saveTimer = useRef(null),
    queue = useRef(createSaveQueue()),
    done = useRef(false),
    dirtySince = useRef(0),
    revisionRef = useRef(Number(initial.answersRev) || 0),
    ackedRef = useRef(Number(initial.answersRev) || 0),
    csrfRef = useRef(session?.csrf || ""),
    offset = useRef(serverNow - Date.now()),
    submitRef = useRef(null);
  csrfRef.current = session?.csrf || "";
  const question = test.questions[index];
  const questionTable = question.table;
  const count = test.questions.length;
  const answered = Object.values(answers).filter(
    (v) => v !== "" && v !== null,
  ).length;
  const save = useCallback(
    (value, rev, { unloading = false } = {}) => {
      if (!rev || rev <= ackedRef.current) return Promise.resolve();
      setSaveStatus("saving");
      const task = queue.current.enqueue(() =>
        deliverSave({
          fetchImpl: fetch,
          beacon: navigator.sendBeacon?.bind(navigator),
          url: `/api/runs/${runId}/answers`,
          payload: { answers: value, revision: rev, csrf: csrfRef.current },
          unloading,
        }).then((result) => {
          const accepted = Number(result.body?.revision || rev);
          if (accepted >= rev) ackedRef.current = Math.max(ackedRef.current, accepted);
          if (ackedRef.current >= revisionRef.current) {
            dirtySince.current = 0;
            setSaveStatus("saved");
          }
          return result;
        }),
      );
      task.catch((error) => {
        if (error?.message === "time_up") return;
        setSaveStatus("saveFailed");
      });
      return task;
    },
    [runId],
  );
  useEffect(() => {
    const ticker = setInterval(() => {
      const s = Math.max(
        0,
        Math.ceil((deadline - Date.now() - offset.current) / 1000),
      );
      setSeconds(s);
      if (s === 0 && !done.current) submitRef.current?.();
    }, 500);
    return () => clearInterval(ticker);
  }, [deadline]);
  useEffect(() => {
    const warn = (e) => {
      if (!done.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const flushNow = useCallback(
    (unloading = true) => {
      if (done.current || revisionRef.current <= ackedRef.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      return save(answersRef.current, revisionRef.current, { unloading });
    },
    [save],
  );
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushNow(true);
      else if (revisionRef.current > ackedRef.current) flushNow(false);
    };
    const onPageHide = () => flushNow(true);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onHide);
      flushNow(true);
    };
  }, [flushNow]);
  useEffect(() => {
    if (saveStatus !== "saveFailed") return;
    const retry = setTimeout(
      () => save(answersRef.current, revisionRef.current),
      3000,
    );
    return () => clearTimeout(retry);
  }, [saveStatus, save]);
  function scheduleSave() {
    if (!dirtySince.current) dirtySince.current = Date.now();
    clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    const remaining = deadline - Date.now() - offset.current;
    const delay = nextDelay(Date.now(), dirtySince.current, remaining);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      save(answersRef.current, revisionRef.current);
    }, delay);
  }
  function answer(value) {
    const next = { ...answersRef.current, [question.id]: value };
    answersRef.current = next;
    revisionRef.current += 1;
    setAnswers(next);
    scheduleSave();
  }
  async function submit() {
    if (done.current) return;
    done.current = true;
    setBusy(true);
    setError(null);
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    try {
      if (revisionRef.current > ackedRef.current)
        await save(answersRef.current, revisionRef.current).catch(() => {});
      await queue.current.wait();
      const result = await api(`/api/runs/${runId}/submit`, {
        answers: answersRef.current,
        revision: revisionRef.current,
      });
      ackedRef.current = revisionRef.current;
      dirtySince.current = 0;
      onFinish(result);
    } catch (e) {
      done.current = false;
      setError(e);
      setBusy(false);
    }
  }
  submitRef.current = submit;
  function go(i) {
    setIndex(i);
    setHelp(false);
    document.getElementById("question-title")?.focus();
  }
  async function leave() {
    setBusy(true);
    try {
      if (revisionRef.current > ackedRef.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        await save(answersRef.current, revisionRef.current);
      }
      await queue.current.wait();
      done.current = true;
      navigate(`/${exam.id}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }
  const timer = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  return (
    <main className={`player ${exam.id}`}>
      <div className="player-toolbar">
        <div>
          <Link
            to={`/${exam.id}`}
            onClick={(e) => {
              e.preventDefault();
              setModal("exit");
            }}
            className="icon-button"
            aria-label={t.exit}
          >
            <ArrowLeft size={19} />
          </Link>
          <div>
            <strong>
              {exam.name} <span> / </span> {testLabel(test.number, t, exam.id)}
            </strong>
            <p>{sectionText(question.section, t)}</p>
          </div>
        </div>
        <button
          className={`help-button toolbar-help ${help ? "on" : ""}`}
          aria-expanded={help}
          onClick={() => setHelp((open) => !open)}
        >
          <Languages size={16} />
          {help ? t.hideHelp : t.showHelp}
        </button>
        <div
          className={`timer ${seconds < 60 ? "urgent" : ""}`}
          role="timer"
          aria-label={t.timeLeft}
        >
          <Clock3 size={18} />
          <span>{timer}</span>
        </div>
        <button
          className="button small"
          disabled={busy}
          onClick={() => setModal("submit")}
        >
          {t.submit}
          <Check size={15} />
        </button>
      </div>
      {test.outline?.length > 1 && (
        <nav className="player-sections" aria-label={t.chooseSection}>
          {test.outline.map((part) => (
            <button
              key={part.id}
              aria-current={
                part.questionIds.includes(question.id) ? "step" : undefined
              }
              onClick={() =>
                go(
                  test.questions.findIndex((q) => q.id === part.questionIds[0]),
                )
              }
              disabled={busy}
            >
              {tr(part.label)}
              <span>
                {part.minutes} {t.minutes}
              </span>
            </button>
          ))}
        </nav>
      )}
      <div className="player-progress">
        <span style={{ width: `${(answered / count) * 100}%` }} />
      </div>
      <div
        className={`player-workspace ${question.passage ? "has-passage" : ""}`}
      >
        {question.passage && question.section !== "Listening" && (
          <section className="passage-panel">
            <div className="eyebrow">
              <BookOpen size={15} />
              {t.passage}
            </div>
            <Passage text={question.passage} />
            {help && mnCopy(question.passageMn) && (
              <div className="help-sheet" lang="mn">
                <p className="help-kicker">{t.helpBelow}</p>
                <p className="help-passage">{mnCopy(question.passageMn)}</p>
              </div>
            )}
          </section>
        )}
        {question.section === "Listening" &&
          (question.passage || question.audio) && (
            <section className="passage-panel listening-player">
              <PracticeAudio
                src={question.audio}
                text={question.passage || question.speechText}
                t={t}
                disabled={busy || seconds === 0}
              />
              <p className="notice">{t.transcriptLater}</p>
            </section>
          )}
        <section className="question-panel">
          <div className="question-top">
            <span className="eyebrow">
              {t.question} {index + 1} {t.of} {count}
            </span>
            <button
              className={`icon-button flag-button ${flags.has(index) ? "flagged" : ""}`}
              aria-label={flags.has(index) ? t.unflag : t.flag}
              aria-pressed={flags.has(index)}
              onClick={() =>
                setFlags((old) => {
                  const next = new Set(old);
                  next.has(index) ? next.delete(index) : next.add(index);
                  return next;
                })
              }
            >
              <Flag
                size={18}
                fill={flags.has(index) ? "currentColor" : "none"}
              />
            </button>
          </div>
          {question.instruction && (
            <p className="question-direction">{question.instruction}</p>
          )}
          <h1
            className="question-title"
            id="question-title"
            tabIndex={-1}
            lang="en"
          >
            {question.prompt.en}
          </h1>
          {question.hint && <p className="fine">{question.hint.en}</p>}
          {questionTable && (
            <div className="task-table">
              <table>
                <thead>
                  <tr>
                    {questionTable[0].map((cell, i) => (
                      <th key={i}>{cell}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {questionTable.slice(1).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!question.passage &&
            (question.audio || question.section === "Listening") && (
              <PracticeAudio
                src={question.audio}
                text={question.prompt.en.replace(
                  "Choose the best response: ",
                  "",
                )}
                t={t}
                disabled={busy || seconds === 0}
              />
            )}
          {question.speechText && (
            <PracticeAudio
              text={question.speechText}
              t={t}
              disabled={busy || seconds === 0}
            />
          )}
          {question.kind === "speaking" && (
            <VoiceResponse
              key={`${runId}-${question.id}`}
              storageKey={`${runId}:${question.id}`}
              t={t}
              disabled={busy || seconds === 0}
            />
          )}

          {question.options ? (
            <fieldset className="answer-options">
              <legend className="sr-only">{t.yourAnswer}</legend>
              {question.options.map((option, i) => (
                <label
                  key={i}
                  className={`answer-option ${String(answers[question.id]) === String(i) ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    value={i}
                    checked={String(answers[question.id]) === String(i)}
                    onChange={() => answer(i)}
                    disabled={busy || seconds === 0}
                  />
                  <span className="option-letter">
                    {"ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i]}
                  </span>
                  <span className="option-copy">
                    <span lang="en">{option.en}</span>
                  </span>
                  <span className="option-check">
                    {String(answers[question.id]) === String(i) && (
                      <Check size={15} />
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : question.kind === "essay" || question.kind === "speaking" ? (
            <label className="written-answer long-response">
              <span>
                {question.kind === "speaking" ? t.speakingNotes : t.yourAnswer}
              </span>
              <textarea
                rows={10}
                maxLength={20000}
                value={answers[question.id] ?? ""}
                onChange={(e) => answer(e.target.value)}
                disabled={busy || seconds === 0}
                placeholder={
                  question.kind === "speaking"
                    ? t.notesPlaceholder
                    : t.essayPlaceholder
                }
              />
              <small>
                {
                  String(answers[question.id] ?? "")
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean).length
                }{" "}
                {t.words}
                {question.minWords
                  ? ` · ${question.minWords}+ ${t.recommended}`
                  : ""}
              </small>
              <small>{t.selfReviewNotice}</small>
            </label>
          ) : (
            <label className="written-answer">
              <span>{t.yourAnswer}</span>
              <input
                autoComplete="off"
                spellCheck="false"
                maxLength={500}
                value={answers[question.id] ?? ""}
                onChange={(e) => answer(e.target.value)}
                placeholder={
                  question.answerForm === "number"
                    ? t.numberPlaceholder
                    : question.answerForm === "time"
                      ? t.timePlaceholder
                      : t.answerPlaceholder
                }
                disabled={busy || seconds === 0}
              />
              {question.answerForm === "number" && (
                <small className="number-note">{t.numberAnswer}</small>
              )}
              {question.answerForm === "time" && (
                <small className="number-note">{t.timeAnswer}</small>
              )}
            </label>
          )}
          {help && (
            <HelpSheet question={question} table={question.tableMn} t={t} />
          )}
          <div className="question-controls">
            <button
              className="button secondary"
              disabled={index === 0 || busy}
              onClick={() => go(index - 1)}
            >
              <ArrowLeft size={15} />
              {t.previous}
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                index === count - 1 ? setModal("submit") : go(index + 1)
              }
            >
              {index === count - 1 ? t.submit : t.next}
              <ArrowRight size={15} />
            </button>
          </div>
          {error && <ErrorState error={error} retry={submit} />}
        </section>
      </div>
      <div className="question-dock">
        <div className="dock-summary">
          <strong>
            {answered}/{count} {t.answered}
          </strong>
          <span
            className={saveStatus === "saveFailed" ? "save-error" : ""}
            role="status"
          >
            {saveStatus === "saved" ? (
              <CheckCircle2 size={13} />
            ) : (
              <Clock3 size={13} />
            )}{" "}
            {t[saveStatus]}
          </span>
        </div>
        <nav className="question-grid" aria-label={t.jump}>
          {test.questions.map((q, i) => (
            <button
              key={q.id}
              aria-label={`${t.question} ${i + 1}${flags.has(i) ? `, ${t.flagged}` : ""}`}
              aria-current={i === index ? "step" : undefined}
              className={`${answers[q.id] !== undefined && answers[q.id] !== "" ? "answered" : ""} ${i === index ? "current" : ""} ${flags.has(i) ? "marked" : ""}`}
              onClick={() => go(i)}
            >
              {i + 1}
              {flags.has(i) && <span />}
            </button>
          ))}
        </nav>
      </div>
      <Modal
        open={modal === "submit"}
        onClose={() => !busy && setModal(null)}
        title={t.confirmFinish}
      >
        <p>
          {answered < count
            ? `${count - answered} ${t.unanswered}`
            : t.allAnswered}
        </p>
        <div className="modal-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setModal(null)}
          >
            {t.keepGoing}
          </button>
          <button className="button" disabled={busy} onClick={submit}>
            {busy ? t.loading : t.reviewSubmit}
            <Check size={15} />
          </button>
        </div>
        {error && <ErrorState error={error} />}
      </Modal>
      <Modal
        open={modal === "exit"}
        onClose={() => !busy && setModal(null)}
        title={t.exitTitle}
      >
        <p>{t.exitText}</p>
        <div className="modal-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setModal(null)}
          >
            {t.stay}
          </button>
          <button className="button" disabled={busy} onClick={leave}>
            {t.leave}
            <ArrowRight size={15} />
          </button>
        </div>
        {error && <ErrorState error={error} />}
      </Modal>
    </main>
  );
}

function TestFlow({ exam, number }) {
  const { t, api, lang } = useApp();
  const { data, error, reload } = useResource(
    `/api/tests/${exam.id}/${number}`,
  );
  const [run, setRun] = useState(null),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [startError, setStartError] = useState(null);
  async function start() {
    setBusy(true);
    setStartError(null);
    try {
      setRun(await api(`/api/tests/${exam.id}/${number}/start`));
    } catch (e) {
      setStartError(e);
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return (
      <main className="state-page">
        <ErrorState error={error} retry={reload} />
      </main>
    );
  if (!data)
    return (
      <main className="state-page">
        <Loading />
      </main>
    );
  if (result)
    return (
      <Results
        result={result}
        exam={exam}
        onRetake={() => {
          setRun(null);
          setResult(null);
        }}
      />
    );
  if (run) return <Player initial={run} exam={exam} onFinish={setResult} />;
  return (
    <main className={`test-intro container ${exam.id}`}>
      <Breadcrumb exam={exam} current={testLabel(number, t, exam.id)} />
      <div className="intro-panel">
        <div className="intro-heading">
          <span className="tag">
            {exam.name} · {testLabel(number, t, exam.id)}
          </span>
          <p className="eyebrow">{t.before}</p>
          <h1>{t.ready}</h1>
          <p>{t.readyText}</p>
        </div>
        <div className="intro-stats">
          <div>
            <Clock3 />
            <strong>{data.minutes}</strong>
            <span>{t.minutes}</span>
          </div>
          <div>
            <PenLine />
            <strong>{data.count}</strong>
            <span>{t.tasks}</span>
          </div>
          <div>
            <Languages />
            <strong>EN / MN</strong>
            <span>{t.showHelp}</span>
          </div>
        </div>
        {data.outline && (
          <div className="test-outline">
            {data.outline.map((part) => (
              <div key={part.id}>
                <strong>{part.label[lang]}</strong>
                <span>
                  {part.count} {t.tasks} · {part.minutes} {t.minutes}
                </span>
              </div>
            ))}
          </div>
        )}
        {data.mode === "full" && <p className="fine">{t.fullTimer}</p>}
        {data.transcriptPractice && (
          <p className="notice">{t.transcriptNotice}</p>
        )}
        {data.selfReview && <p className="notice">{t.selfReviewNotice}</p>}
        <ul className="intro-rules">
          {[t.timerRule, t.helpRule, t.scoreRule].map((s) => (
            <li key={s}>
              <Check size={16} />
              {s}
            </li>
          ))}
        </ul>
        <button className="button" onClick={start} disabled={busy}>
          {busy ? t.loading : t.begin}
          <ArrowRight size={18} />
        </button>
        {startError && <ErrorState error={startError} retry={start} />}
        <p className="fine">
          {data.sections.map((x) => sectionText(x, t)).join(" · ")}
        </p>
      </div>
    </main>
  );
}

function TestPage() {
  const { exam: id, number } = useParams();
  const { catalog, session } = useApp();
  const exam = catalog.find((e) => e.id === id);
  const known =
    exam &&
    (["sample", "1", "2", "3", "4", "5"].includes(number) ||
      exam.modes.some(
        (m) =>
          m.sample.number === number ||
          m.tests.some((test) => test.number === number),
      ) ||
      exam.books?.some((mode) =>
        mode.tests.some((test) => test.number === number),
      ));
  if (!known) return <NotFound />;
  if (
    !String(number).endsWith("sample") &&
    !session.user?.isAdmin &&
    !session.grants.includes(id)
  )
    return (
      <main className={id}>
        <Locked exam={exam} number={number} />
      </main>
    );
  return <TestFlow key={`${id}-${number}`} exam={exam} number={number} />;
}

export default TestPage;
