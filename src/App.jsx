import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { BrandMark } from "./Brand.jsx";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Flag,
  Globe2,
  GraduationCap,
  Languages,
  LockKeyhole,
  Menu,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkle,
  X,
  LogOut,
  Headphones,
  PenLine,
} from "lucide-react";
import { strings } from "./i18n.js";
import { PracticeAudio, VoiceResponse } from "./PracticeMedia.jsx";
const STOCK_MN = "Энэ шинэ сорилын асуулт англи хэл дээр.";
function mnCopy(value) {
  const text = typeof value === "string" ? value : value?.mn;
  if (!text || text === STOCK_MN) return "";
  if (typeof value === "object" && value.en && text.trim() === value.en.trim())
    return "";
  if (!/[А-Яа-яӨөҮү]/.test(text)) return "";
  return text;
}
function formatBand(value) {
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}
const sectionText = (section, t) =>
  ({
    Reading: t.reading,
    "Reading & Writing": t.readingWriting,
    Math: t.math,
    Listening: t.listening,
    Writing: t.writing,
    Speaking: t.speaking,
  })[section] || section;
function testLabel(number, t, examId) {
  const length = String(number).match(
    /^length-(?:(rw1|rw2|math1|math2|listening|reading|writing|speaking)-)?(\d+)$/,
  );
  if (length) {
    const section = {
      rw1: t.readingWriting,
      rw2: t.readingWriting,
      math1: t.math,
      math2: t.math,
      listening: t.listening,
      reading: t.reading,
      writing: t.writing,
      speaking: t.speaking,
    }[length[1]];
    const moduleNumber = length[1]?.endsWith("2")
      ? " 2"
      : length[1]?.endsWith("1")
        ? " 1"
        : "";
    return `${section ? `${section}${moduleNumber} · ` : ""}${t.fullLength} ${length[2]}`;
  }
  const match = String(number).match(
    /^(reading|math|listening|writing|speaking|full)-(sample|[1-5])$/,
  );
  if (!match) return number === "sample" ? t.sample : `${t.set} ${number}`;
  return `${examId === "sat" && match[1] === "reading" ? t.readingWriting : t[match[1]]} · ${match[2] === "sample" ? t.sample : `${t.set} ${match[2]}`}`;
}
const Context = createContext(null);
const useApp = () => useContext(Context);
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const value = await response.json();
  if (!response.ok) {
    const e = new Error(value.error || "server_error");
    e.status = response.status;
    throw e;
  }
  return value;
}
function useResource(url) {
  const [data, setData] = useState(null),
    [error, setError] = useState(null),
    [version, setVersion] = useState(0);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setData(null);
    setError(null);
    request(url)
      .then((x) => alive && setData(x))
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [url, version]);
  return { data, error, reload: () => setVersion((x) => x + 1) };
}
const safeRead = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
function Provider({ children }) {
  const [lang, setLangState] = useState(() =>
      safeRead("studyroom.language", "mn"),
    ),
    [session, setSession] = useState(null),
    [catalog, setCatalog] = useState([]),
    [error, setError] = useState(null);
  const refresh = useCallback(async () => {
    const data = await request("/api/session");
    setSession(data);
    return data;
  }, []);
  const initialize = useCallback(() => {
    setError(null);
    Promise.all([refresh(), request("/api/catalog").then(setCatalog)]).catch(
      setError,
    );
  }, [refresh]);
  useEffect(initialize, [initialize]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = (next) => {
    setLangState(next);
    try {
      localStorage.setItem("studyroom.language", next);
    } catch {}
  };
  const api = (url, body, method = "POST") =>
    request(url, {
      method,
      headers: { "x-csrf-token": session?.csrf || "" },
      body: JSON.stringify(body ?? {}),
    });
  const value = {
    lang,
    setLang,
    t: strings[lang] || strings.en,
    tr: (value) =>
      typeof value === "string" ? value : value?.[lang] || value?.en || "",
    session,
    catalog,
    refresh,
    api,
  };
  return (
    <Context.Provider value={value}>
      {error ? (
        <main className="state-page">
          <ErrorState retry={initialize} />
        </main>
      ) : !session || !catalog.length ? (
        <main className="state-page">
          <Loading />
        </main>
      ) : (
        children
      )}
    </Context.Provider>
  );
}
function Loading() {
  const { t } = useApp();
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      {t.loading}
    </div>
  );
}
function ErrorState({ retry, error }) {
  const { t } = useApp();
  const message =
    error?.message === "access_required"
      ? t.accessError
      : error?.message === "login_required"
        ? t.loginRequired
        : t.error;
  return (
    <div className="error-state" role="alert">
      <p>{message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          <RotateCcw size={16} />
          {t.retry}
        </button>
      )}
    </div>
  );
}
function AsteriskMark() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 3v34M3 20h34M8 8l24 24M8 32L32 8"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function Logo() {
  return (
    <Link className="logo" to="/" aria-label="Eight Steppe Academy home">
      <BrandMark className="logo-mark" />
      <span className="logo-words">
        <span className="logo-name">Eight Steppe</span>
        <span className="logo-academy">Academy</span>
      </span>
    </Link>
  );
}
function Header() {
  const { t, lang, setLang, session } = useApp();
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  useEffect(() => setMenu(false), [location.pathname]);
  return (
    <header className="header">
      <div className="header-inner">
        <Logo />
        <nav
          aria-label="Main navigation"
          className={menu ? "main-nav expanded" : "main-nav"}
        >
          {["ielts", "toefl", "sat"].map((id) => (
            <NavLink
              key={id}
              to={`/${id}`}
              className={({ isActive }) =>
                `nav-exam ${id} ${isActive ? "active" : ""}`
              }
            >
              <span className="color-dot" />
              {id.toUpperCase()}
            </NavLink>
          ))}
          <span className="nav-divider" />
          <NavLink to="/account">{t.myLearning}</NavLink>
        </nav>
        <div className="header-actions">
          <div className="language-toggle" aria-label="Interface language">
            <button aria-pressed={lang === "mn"} onClick={() => setLang("mn")}>
              MN
            </button>
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>
              EN
            </button>
          </div>
          <Link
            className="button small header-login"
            to={session.user ? "/account" : "/login"}
          >
            {session.user ? (
              <span className="avatar">{session.user.name[0]}</span>
            ) : (
              t.signIn
            )}
            {!session.user && <ArrowUpRight size={15} />}
          </Link>
          <button
            className="icon-button menu-toggle"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  );
}
function Footer() {
  const { t } = useApp();
  return (
    <footer className="footer">
      <div className="footer-top">
        <div>
          <Logo />
          <p>{t.footerLine}</p>
        </div>
        <div className="footer-links">
          {["ielts", "toefl", "sat"].map((x) => (
            <Link to={`/${x}`} key={x}>
              {x.toUpperCase()}
              <ArrowUpRight size={13} />
            </Link>
          ))}
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Eight Steppe Academy. {t.allRights}</span>
        <span>{t.independent}</span>
      </div>
    </footer>
  );
}
function ScrollManager() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
function ExamArt({ exam, compact = false }) {
  return (
    <div
      className={`exam-art ${exam} ${compact ? "compact" : ""}`}
      aria-hidden="true"
    >
      {exam === "ielts" ? (
        <>
          <div className="art-rings" />
          <span className="art-type">
            Aa<span>.</span>
          </span>
        </>
      ) : exam === "toefl" ? (
        <>
          <div className="art-steps">
            <i />
            <i />
            <i />
            <i />
          </div>
          <span className="art-star">
            <AsteriskMark />
          </span>
        </>
      ) : (
        <>
          <div className="art-grid" />
          <span className="art-equation">
            x<sup>2</sup>
          </span>
          <div className="art-circle" />
        </>
      )}
    </div>
  );
}
function Home() {
  const { t, catalog, lang, tr } = useApp();
  const [demo, setDemo] = useState(null);
  return (
    <>
      <main>
        <section className="hero container">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="tiny-star">
                <AsteriskMark />
              </span>
              {t.eyebrow}
            </div>
            <h1>
              {t.hero1}
              <br />
              <em>{t.hero2}</em>
            </h1>
            <p className="hero-description">{t.heroText}</p>
            <div className="hero-actions">
              <a className="button" href="#collection">
                {t.explore}
                <ArrowRight size={17} />
              </a>
              <Link className="text-link" to="/ielts/tests/sample">
                {t.tryFree}
                <ArrowUpRight size={17} />
              </Link>
            </div>
            <p className="fine hero-fine">
              <Check size={14} />
              {t.freeNote}
            </p>
          </div>
          <div className="hero-visual">
            <div className="paper-back paper-back-one" />
            <div className="paper-back paper-back-two" />
            <div className="practice-paper">
              <div className="paper-top">
                <span>{t.daily}</span>
                <Bookmark size={18} />
              </div>
              <div className="paper-exam">
                <span className="tag sat">SAT</span>
                <span>READING & WRITING</span>
              </div>
              <h2 lang="en">
                One question.
                <br />A fresh perspective.
              </h2>
              <p lang="en" className="demo-question">
                {t.dailyPrompt}
              </p>
              <div
                className="demo-choices"
                role="group"
                aria-label="Try a sample answer"
              >
                {["are", "were", "is", "have been"].map((a, i) => (
                  <button
                    key={a}
                    className={`${demo === i ? "selected" : ""} ${demo === 2 && i === 2 ? "correct" : ""}`}
                    onClick={() => setDemo(i)}
                  >
                    <span>{"ABCD"[i]}</span>
                    {a}
                    {demo === 2 && i === 2 && <Check size={14} />}
                  </button>
                ))}
              </div>
              <div className="paper-bottom" aria-live="polite">
                {demo === null ? (
                  <>
                    <span>{t.dailyFooter}</span>
                    <ArrowUpRight size={17} />
                  </>
                ) : (
                  <span className={demo === 2 ? "demo-good" : ""}>
                    {demo === 2 ? t.demoCorrect : t.demoWrong}
                  </span>
                )}
              </div>
            </div>
            <div className="side-note">
              <span>✧</span>
              {lang === "en" ? (
                <>
                  A good place
                  <br />
                  to begin.
                </>
              ) : (
                <>
                  Эхлэхэд
                  <br />
                  сайхан газар.
                </>
              )}
            </div>
          </div>
        </section>
        <section className="collection-section container" id="collection">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t.ourLibrary}</p>
              <h2>{t.choose}</h2>
            </div>
            <p>{t.chooseText}</p>
          </div>
          <div className="exam-cards">
            {catalog.map((exam, i) => (
              <Link
                to={`/${exam.id}`}
                className={`exam-card ${exam.id}`}
                key={exam.id}
              >
                <div className="exam-card-top">
                  <span className="card-index">0{i + 1} /</span>
                  <span className="edition">{exam.edition}</span>
                </div>
                <ExamArt exam={exam.id} />
                <div className="exam-card-body">
                  <h3>
                    {exam.name}
                    <ArrowUpRight />
                  </h3>
                  <p>{tr(exam.tagline)}</p>
                  <div className="card-features">
                    <span>
                      <BookOpen size={14} />
                      {exam.count} {t.practiceSets}
                    </span>
                    <span className="free-dot">{t.sample}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
        <section className="features-strip container">
          {[
            [Languages, t.bilingual, t.bilingualText],
            [Clock3, t.timed, t.timedText],
            [BookOpen, t.learn, t.learnText],
          ].map(([Icon, title, body]) => (
            <article key={title}>
              <span className="feature-icon">
                <Icon size={21} strokeWidth={1.5} />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </section>
        <section className="how-section container">
          <div className="how-intro">
            <p className="eyebrow">{t.how}</p>
            <h2>{t.howTitle}</h2>
            <div className="little-path" aria-hidden="true">
              <span>01</span>
              <i />
              <span>02</span>
              <i />
              <span>03</span>
              <ArrowUpRight />
            </div>
          </div>
          <div className="how-steps">
            {[1, 2, 3].map((n) => (
              <article key={n}>
                <span className="step-number">0{n}</span>
                <div>
                  <h3>{t[`step${n}`]}</h3>
                  <p>{t[`step${n}Text`]}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="closing container">
          <span className="closing-star" aria-hidden="true">
            <AsteriskMark />
          </span>
          <div>
            <h2>{t.bottomTitle}</h2>
            <p>{t.bottomText}</p>
          </div>
          <a className="button" href="#collection">
            {t.explore}
            <ArrowRight size={17} />
          </a>
        </section>
      </main>
      <Footer />
    </>
  );
}
function ExamPage() {
  const { exam: id } = useParams();
  const [params, setParams] = useSearchParams();
  const { t, tr, catalog, session } = useApp();
  const exam = catalog.find((e) => e.id === id);
  if (!exam) return <NotFound />;
  const unlocked = session.user?.isAdmin || session.grants.includes(id);
  const account = useResource(session.user ? "/api/account" : null);
  const latestMark = (number) => {
    const row = account.data?.history?.find(
      (item) => String(item.test_number) === String(number),
    );
    if (!row) return "";
    if (row.band != null) return formatBand(row.band);
    return `${row.score}/${row.total}`;
  };
  const [bookId, setBookId] = useState(exam.books?.[0]?.id);
  const bookMode =
    exam.books?.find((mode) => mode.id === bookId) || exam.books?.[0];
  const mode =
    exam.modes.find((m) => m.id === (params.get("section") || "reading")) ||
    exam.modes[0];
  return (
    <>
      <main className={`exam-page ${id}`}>
        <section className="exam-hero container">
          <div>
            <Breadcrumb exam={exam} />
            <p className="eyebrow">
              YOUR NEXT CHAPTER / {exam.edition.toUpperCase()}
            </p>
            <h1>
              {exam.name}
              <span className="exam-title-dot">.</span>
            </h1>
            <h2>{tr(exam.tagline)}</h2>
            <p className="exam-description">{tr(exam.description)}</p>
            <div className="skill-tags">
              {exam.skills.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
          </div>
          <div className="exam-cover">
            <span className="cover-label">THE STUDYROOM COLLECTION</span>
            <ExamArt exam={id} />
            <div>
              <span>{exam.name}</span>
              <span>01—05</span>
            </div>
          </div>
        </section>
        <div className="exam-tabs container">
          <a href="#practice" className="active">
            <PenLine size={16} />
            {t.practice}
          </a>
          <Link to={`/${id}/guide`}>
            <BookOpen size={16} />
            {t.guide}
          </Link>
          <span>
            {unlocked ? (
              <>
                <CheckCircle2 size={15} />
                {t.accessApproved}
              </>
            ) : (
              <>
                <span className="color-dot" />
                {t.sample} · {t.free.toLowerCase()}
              </>
            )}
          </span>
        </div>
        <section id="practice" className="library container">
          <div className="section-heading">
            <div>
              <h2>{t.testLibrary}</h2>
              <p>{t.testLibraryText}</p>
            </div>
            <p className="scope-note">{t.sectionScope}</p>
          </div>
          <div
            className="practice-modes"
            role="group"
            aria-label={t.chooseSection}
          >
            {exam.modes.map((m) => (
              <button
                key={m.id}
                aria-pressed={mode.id === m.id}
                className={`practice-mode ${mode.id === m.id ? "selected" : ""} ${m.id === "full" ? "full-mode" : ""}`}
                onClick={() =>
                  setParams({ section: m.id }, { preventScrollReset: true })
                }
              >
                {m.id === "full" ? (
                  <GraduationCap size={18} />
                ) : m.id === "listening" ? (
                  <Headphones size={18} />
                ) : (
                  <PenLine size={18} />
                )}
                <span>{tr(m.label)}</span>
              </button>
            ))}
          </div>
          <div className="mode-description" aria-live="polite">
            <h3>{tr(mode.label)}</h3>
            <p>{mode.id === "full" ? t.fullScope : t.sectionDetail}</p>
            {(mode.id === "listening" ||
              (mode.id === "full" && id !== "sat")) && (
              <p>{t.transcriptNotice}</p>
            )}
          </div>
          <div className="library-layout">
            <div className="test-list">
              <Link
                to={`/${id}/tests/${mode.sample.number}`}
                className="sample-card"
              >
                <div className="sample-icon">
                  <Sparkle size={27} strokeWidth={1.3} />
                </div>
                <div>
                  <span className="tag free">{t.free}</span>
                  <h3>{t.sample}</h3>
                  <p>{t.sampleText}</p>
                  <span className="test-meta">
                    <Clock3 size={14} />
                    {mode.sample.minutes} {t.minutes}
                    <span>·</span>
                    {mode.sample.count} {t.tasks}
                  </span>
                </div>
                <span className="round-arrow">
                  <ArrowUpRight size={21} />
                </span>
              </Link>
              {mode.tests.map((test) => (
                <Link
                  className="test-row"
                  to={`/${id}/tests/${test.number}`}
                  key={test.number}
                >
                  <span className="test-number">
                    {String(test.set).padStart(2, "0")}
                  </span>
                  <div className="test-row-info">
                    <h3>
                      {t.set} {String(test.set).padStart(2, "0")}
                    </h3>
                    <p>
                      {tr(mode.label)} · {exam.topics[test.set - 1]}
                    </p>
                    <span className="test-meta">
                      {test.sections.map((x) => sectionText(x, t)).join(" + ")}
                      <span>·</span>
                      {test.count} {t.tasks}
                      <span>·</span>
                      {test.minutes} {t.minutes}
                    </span>
                  </div>
                  <span className="row-end">
                    {latestMark(test.number) && (
                      <span className="row-score">{latestMark(test.number)}</span>
                    )}
                    <span className={`row-lock ${unlocked ? "unlocked" : ""}`}>
                      {unlocked ? (
                        <ArrowUpRight size={19} />
                      ) : (
                        <LockKeyhole size={17} />
                      )}
                      <span>{unlocked ? t.open : t.member}</span>
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            <aside className="library-sidebar">
              <div className="guide-promo">
                <BookOpen size={26} strokeWidth={1.3} />
                <p className="eyebrow">{t.freeGuide}</p>
                <h3>{t.guide}</h3>
                <p>{t.guideText}</p>
                <Link className="text-link" to={`/${id}/guide`}>
                  {t.readGuide}
                  <ArrowRight size={16} />
                </Link>
                <div className="guide-lines" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              {!unlocked && (
                <div className="access-promo">
                  <ShieldCheck size={21} />
                  <h3>{t.accessText}</h3>
                  <p>{t.accessDetail}</p>
                  <Link
                    className="button secondary full"
                    to={`/${id}/tests/${mode.id}-1`}
                  >
                    {t.access}
                    <ArrowRight size={16} />
                  </Link>
                </div>
              )}
            </aside>
          </div>
        </section>
        {bookMode && (
          <section className="library container full-length-library">
            <div className="section-heading">
              <div>
                <h2>{t.fullLength}</h2>
                <p>{t.fullLengthText}</p>
              </div>
            </div>
            <div className="practice-modes" role="group" aria-label={t.fullLength}>
              {exam.books.map((mode) => (
                <button
                  key={mode.id}
                  aria-pressed={bookMode.id === mode.id}
                  className={`practice-mode ${bookMode.id === mode.id ? "selected" : ""}`}
                  onClick={() => setBookId(mode.id)}
                >
                  <span>{tr(mode.label)}</span>
                </button>
              ))}
            </div>
            <div className="test-list">
              {bookMode.tests.map((test) => (
                <Link
                  className="test-row"
                  to={`/${id}/tests/${test.number}`}
                  key={test.number}
                >
                  <span className="test-number">
                    {String(test.set).padStart(2, "0")}
                  </span>
                  <div className="test-row-info">
                    <h3>
                      {t.fullLength} {String(test.set).padStart(2, "0")}
                    </h3>
                    <span className="test-meta">
                      {test.count} {t.tasks}
                      <span>·</span>
                      {test.minutes} {t.minutes}
                    </span>
                  </div>
                  <span className="row-end">
                    {latestMark(test.number) && (
                      <span className="row-score">{latestMark(test.number)}</span>
                    )}
                    <span className={`row-lock ${unlocked ? "unlocked" : ""}`}>
                      {unlocked ? (
                        <ArrowUpRight size={19} />
                      ) : (
                        <LockKeyhole size={17} />
                      )}
                      <span>{unlocked ? t.open : t.member}</span>
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
function Breadcrumb({ exam, current }) {
  const { t } = useApp();
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <Link to="/">{t.home}</Link>
      <ChevronRight size={12} />
      {current ? (
        <>
          <Link to={`/${exam.id}`}>{exam.name}</Link>
          <ChevronRight size={12} />
          <span>{current}</span>
        </>
      ) : (
        <span>{exam.name}</span>
      )}
    </nav>
  );
}
function Locked({ exam, number = "reading-1" }) {
  const { t, session, api, refresh } = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const pending =
    session.requests.find((r) => r.exam === exam.id)?.status === "pending";
  async function ask() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/access-requests", { exam: exam.id });
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="access-page container">
      <Breadcrumb exam={exam} current={t.access} />
      <div className="access-layout">
        <div className="locked-cover">
          <ExamArt exam={exam.id} />
          <span>{exam.name}</span>
          <p>THE PRACTICE COLLECTION</p>
          <div className="locked-cover-bottom">
            <LockKeyhole size={20} />
            01 — 05
          </div>
        </div>
        <div className="access-copy">
          <span className="tag">{t.member}</span>
          <h1>{t.accessText}</h1>
          <p>{t.accessDetail}</p>
          <ul className="check-list">
            {[t.includes1, t.includes2, t.includes3].map((s) => (
              <li key={s}>
                <CheckCircle2 size={17} />
                {s}
              </li>
            ))}
          </ul>
          {pending ? (
            <div className="notice success" role="status">
              <Clock3 size={19} />
              <div>
                <strong>{t.requested}</strong>
                <p>{t.pendingDetail}</p>
              </div>
            </div>
          ) : session.user ? (
            <button disabled={busy} onClick={ask} className="button">
              {busy ? t.loading : t.request}
              <ArrowRight size={17} />
            </button>
          ) : (
            <Link
              className="button"
              to={`/login?next=/${exam.id}/tests/${number}`}
            >
              {t.google}
              <ArrowUpRight size={17} />
            </Link>
          )}
          <p className="fine">{t.noPayment}</p>
          {error && <ErrorState error={error} retry={ask} />}
          <Link
            className="text-link"
            to={`/${exam.id}/tests/${number.includes("-") ? number.split("-")[0] : "reading"}-sample`}
          >
            {t.tryFree}
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
function Login() {
  const { t, session } = useApp();
  const [params] = useSearchParams();
  if (session.user) return <Account />;
  const next = params.get("next") || "/account";
  return (
    <main className="login-page container">
      <div className="login-decoration">
        <div className="login-shape" aria-hidden="true">
          <span>Aa</span>
          <span>
            <AsteriskMark />
          </span>
          <span>x²</span>
        </div>
        <p>YOUR NEXT CHAPTER</p>
        <h2>{t.footerLine}</h2>
      </div>
      <div className="login-content">
        <span className="feature-icon">
          <BookOpen size={25} />
        </span>
        <h1>{t.welcome}</h1>
        <p>{t.loginText}</p>
        {params.has("error") && (
          <p className="notice error" role="alert">
            {t.loginFailed}
          </p>
        )}
        {session.authAvailable ? (
          <a
            className="button google-button"
            href={`/api/auth/google?next=${encodeURIComponent(next)}`}
          >
            <GoogleIcon />
            {t.google}
          </a>
        ) : (
          <>
            <button className="button google-button" disabled>
              <GoogleIcon />
              {t.google}
            </button>
            <p className="notice">{t.loginUnavailable}</p>
          </>
        )}
        <p className="privacy-note">
          <ShieldCheck size={16} />
          {t.privacyNote}
        </p>
        <Link className="text-link" to="/">
          <ArrowLeft size={15} />
          {t.backHome}
        </Link>
      </div>
    </main>
  );
}
function GoogleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.8 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.6Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.8-2.3l-3.3-2.6c-.9.6-2.1.9-3.5.9-2.7 0-5-1.9-5.8-4.4H2.8v2.7A10.2 10.2 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.2 13.6a6.2 6.2 0 0 1 0-3.2V7.7H2.8a10.1 10.1 0 0 0 0 8.6l3.4-2.7Z"
      />
      <path
        fill="#EA4335"
        d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10.2 10.2 0 0 0-9.2 5.7l3.4 2.7C7 7.9 9.3 6 12 6Z"
      />
    </svg>
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
function Modal({ open, onClose, title, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (open && !ref.current.open) ref.current.showModal();
    else if (!open && ref.current.open) ref.current.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
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
  const { t, api, tr } = useApp();
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
    queue = useRef(Promise.resolve()),
    done = useRef(false),
    offset = useRef(serverNow - Date.now()),
    submitRef = useRef(null);
  const question = test.questions[index];
  const questionTable = question.table;
  const count = test.questions.length;
  const answered = Object.values(answers).filter(
    (v) => v !== "" && v !== null,
  ).length;
  const save = useCallback(
    (value) => {
      setSaveStatus("saving");
      const task = queue.current
        .catch(() => {})
        .then(() =>
          api(`/api/runs/${runId}/answers`, { answers: value }, "PUT"),
        );
      queue.current = task;
      task
        .then(() => {
          if (answersRef.current === value) setSaveStatus("saved");
        })
        .catch((e) => {
          if (e.message !== "time_up") setSaveStatus("saveFailed");
        });
      return task;
    },
    [runId, api],
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
  useEffect(() => () => clearTimeout(saveTimer.current), []);
  useEffect(() => {
    if (saveStatus !== "saveFailed") return;
    const retry = setTimeout(() => save(answersRef.current), 3000);
    return () => clearTimeout(retry);
  }, [saveStatus, save]);
  function answer(value) {
    const next = { ...answersRef.current, [question.id]: value };
    answersRef.current = next;
    setAnswers(next);
    if (question.kind === "essay" || question.kind === "speaking") {
      clearTimeout(saveTimer.current);
      setSaveStatus("saving");
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        save(answersRef.current);
      }, 300);
    } else save(next);
  }
  async function submit() {
    if (done.current) return;
    done.current = true;
    setBusy(true);
    setError(null);
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    try {
      await queue.current.catch(() => {});
      const result = await api(`/api/runs/${runId}/submit`, {
        answers: answersRef.current,
      });
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
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        await save(answersRef.current);
      }
      await queue.current;
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
        {question.passage && (
          <section className="passage-panel">
            <div className="eyebrow">
              <BookOpen size={15} />
              {question.section === "Listening" ? t.transcript : t.passage}
            </div>
            {question.section === "Listening" && (
              <PracticeAudio
                src={question.audio}
                text={question.passage}
                t={t}
                disabled={busy || seconds === 0}
              />
            )}
            <Passage text={question.passage} />
            {help && mnCopy(question.passageMn) && (
              <div className="help-sheet" lang="mn">
                <p className="help-kicker">{t.helpBelow}</p>
                <p className="help-passage">{mnCopy(question.passageMn)}</p>
              </div>
            )}
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
function Results({ result, exam, onRetake }) {
  const { t, tr, lang, session } = useApp();
  const [showMn, setShowMn] = useState(false);
  function display(q, value) {
    if (value === "" || value === undefined) return t.notAnswered;
    if (q.options)
      return (
        (showMn
          ? q.options[Number(value)]?.mn
          : tr(q.options[Number(value)])) || String(value)
      );
    return showMn && q.answerMn && String(value) === String(q.answer)
      ? `${value} — ${q.answerMn}`
      : String(value);
  }
  return (
    <main className={`results-page container ${exam.id}`}>
      <Breadcrumb exam={exam} current={t.result} />
      <section className="results-hero">
        <div>
          <span className="eyebrow">
            {exam.name} / {testLabel(result.number, t, exam.id)}
          </span>
          <h1>{t.results}</h1>
          <p>{t.resultsText}</p>
          <div className="results-actions">
            {onRetake ? (
              <button className="button" onClick={onRetake}>
                <RotateCcw size={16} />
                {t.retake}
              </button>
            ) : (
              <Link
                className="button"
                to={`/${exam.id}/tests/${result.number}`}
              >
                <RotateCcw size={16} />
                {t.retake}
              </Link>
            )}
            <Link className="text-link" to={`/${exam.id}`}>
              {t.backExam}
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <div className="score-card">
          <div
            className="score-ring"
            style={{
              "--score": `${result.total ? (result.score / result.total) * 100 : 0}%`,
            }}
          >
            <strong>
              {result.band != null
                ? formatBand(result.band)
                : result.total
                  ? Math.round((result.score / result.total) * 100)
                  : "✓"}
              {result.band == null && result.total > 0 && <small>%</small>}
            </strong>
          </div>
          <span>
            {result.total
              ? `${result.score} / ${result.total} ${t.correct}`
              : t.selfReview}
          </span>
          {result.bandParts?.length > 0 && (
            <p className="band-parts">
              {result.bandParts
                .map(
                  (part) =>
                    `${sectionText(part.section, t)} ${formatBand(part.band)}`,
                )
                .join(" · ")}
            </p>
          )}
          {result.band != null && <p>{t.bandSkipped}</p>}
          <p>{result.selfReviewCount ? t.selfReviewNotice : t.practiceOnly}</p>
        </div>
      </section>
      {result.sectionResults?.length > 1 && (
        <div className="section-results">
          {result.sectionResults.map((part) => (
            <div key={part.section}>
              <strong>{sectionText(part.section, t)}</strong>
              <span>
                {part.total
                  ? `${part.score} / ${part.total} ${t.correct}`
                  : t.selfReview}
              </span>
              {part.selfReviewCount > 0 && part.total > 0 && (
                <small>
                  {part.selfReviewCount} {t.selfReviewTasks}
                </small>
              )}
            </div>
          ))}
        </div>
      )}
      {result.selfReviewCount > 0 && (
        <p className="notice">
          {result.selfReviewCount} {t.selfReviewTasks}. {t.selfReviewNotice}
        </p>
      )}
      {result.expired && (
        <div className="notice">
          <Clock3 size={17} />
          {t.timeUp}
        </div>
      )}
      <p className="saved-note">
        <CheckCircle2 size={16} />
        {session.user ? t.historySaved : t.guestResult}
      </p>
      <div className="section-heading">
        <h2>{t.reviewAnswers}</h2>
        <button
          className={`help-button ${showMn ? "on" : ""}`}
          aria-pressed={showMn}
          onClick={() => setShowMn(!showMn)}
        >
          <Languages size={16} />
          {showMn ? t.hideHelp : t.showHelp}
        </button>
      </div>
      <div className="review-list">
        {result.results.map((q, i) => (
          <details
            className={`review-item ${q.correct === null ? "self-review" : q.correct ? "correct" : "incorrect"}`}
            key={q.id}
            open={!q.correct}
          >
            <summary>
              <span className="review-status">
                {q.correct === null ? (
                  <PenLine size={16} />
                ) : q.correct ? (
                  <Check size={16} />
                ) : (
                  <X size={16} />
                )}
              </span>
              <span className="review-index">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>
                {q.prompt.en}
                {showMn && mnCopy(q.prompt) && (
                  <small className="review-mn" lang="mn">
                    {mnCopy(q.prompt)}
                  </small>
                )}
              </span>
              <Plus size={17} />
            </summary>
            <div className="review-body">
              <div className="review-answers">
                <p>
                  <span>{t.yourAnswer}</span>
                  <strong>{display(q, q.supplied)}</strong>
                </p>
                {q.correct !== null && (
                  <p>
                    <span>{t.correctAnswer}</span>
                    <strong>
                      {(Array.isArray(q.answer) ? q.answer : [q.answer])
                        .map((a) => display(q, a))
                        .join(" / ")}
                    </strong>
                  </p>
                )}
              </div>
              {q.kind === "speaking" && (
                <VoiceResponse
                  storageKey={`${result.runId}:${q.id}`}
                  t={t}
                  readOnly
                />
              )}
              <div className="review-explanation">
                <BookOpen size={17} />
                <div>
                  <strong>
                    {q.correct === null ? t.reviewGuidance : t.explanation}
                  </strong>
                  <p>{showMn ? q.explanation.mn : tr(q.explanation)}</p>
                  {lang === "en" &&
                    !showMn &&
                    q.explanation.en ===
                      "Review the source text and the correct answer." &&
                    q.explanation.mn !==
                      "Эх бичвэр болон зөв хариулттай харьцуулж шалгаарай." && (
                      <p lang="mn">{q.explanation.mn}</p>
                    )}
                </div>
              </div>
              {showMn && q.options && (
                <div className="translated-options">
                  {q.options.map((o, j) => (
                    <p key={j}>
                      {"ABCD"[j]}. {o.en} — {o.mn}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </main>
  );
}
function Guide() {
  const { exam: id } = useParams();
  const { catalog, t, tr } = useApp();
  const exam = catalog.find((e) => e.id === id);
  const { data, error, reload } = useResource(`/api/guides/${id}`);
  const [chapter, setChapter] = useState(0);
  if (!exam) return <NotFound />;
  if (error)
    return (
      <main className="state-page">
        <ErrorState retry={reload} />
      </main>
    );
  if (!data)
    return (
      <main className="state-page">
        <Loading />
      </main>
    );
  const lesson = data.chapters[chapter];
  return (
    <main className={`guide-page container ${id}`}>
      <Breadcrumb exam={exam} current={t.guide} />
      <div className="guide-heading">
        <p className="eyebrow">
          {exam.name} / {t.freeGuide}
        </p>
        <h1>{t.guide}</h1>
        <p>{t.guideIntro}</p>
      </div>
      <div className="guide-layout">
        <aside>
          <p className="eyebrow">{t.chapters}</p>
          <nav aria-label={t.chapters}>
            {data.chapters.map((c, i) => (
              <button
                key={i}
                className={chapter === i ? "active" : ""}
                onClick={() => {
                  setChapter(i);
                  window.scrollTo(0, 0);
                }}
                aria-current={chapter === i ? "page" : undefined}
              >
                <span>0{i + 1}</span>
                {tr(c.title)}
                <ChevronRight size={15} />
              </button>
            ))}
          </nav>
          <div className="guide-tip">
            <BookOpen size={23} />
            <p className="eyebrow">{t.studyTip}</p>
            <p>{t.tipText}</p>
            <Link to={`/${id}/tests/sample`} className="text-link">
              {t.openSample}
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </aside>
        <article className="lesson">
          <span className="tag">
            {t.lesson} 0{chapter + 1}
          </span>
          <h2>{tr(lesson.title)}</h2>
          <p className="lesson-summary">{tr(lesson.summary)}</p>
          <div className="source-label">
            <Languages size={17} />
            <div>
              <strong>{t.sourceMaterial}</strong>
              <p>{t.sourceNote}</p>
            </div>
          </div>
          <div className="lesson-original" lang="mn">
            {lesson.body}
          </div>
          <p className="fine">
            {t.source}: {data.source} · {lesson.pages} {t.pages}
          </p>
          <div className="question-controls">
            <button
              className="button secondary"
              disabled={chapter === 0}
              onClick={() => {
                setChapter(chapter - 1);
                window.scrollTo(0, 0);
              }}
            >
              <ArrowLeft size={15} />
              {t.previous}
            </button>
            {chapter < 3 ? (
              <button
                className="button"
                onClick={() => {
                  setChapter(chapter + 1);
                  window.scrollTo(0, 0);
                }}
              >
                {t.continue}
                <ArrowRight size={15} />
              </button>
            ) : (
              <Link className="button" to={`/${id}/tests/sample`}>
                {t.openSample}
                <ArrowRight size={15} />
              </Link>
            )}
          </div>
        </article>
      </div>
    </main>
  );
}
function Account() {
  const { session, t, catalog, api, refresh, lang } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  if (!session.user) return <Login />;
  async function logout() {
    try {
      await api("/api/logout");
      await refresh();
      navigate("/");
    } catch (e) {
      setError(e);
    }
  }
  return (
    <main className="account-page container">
      <div className="account-heading">
        <div>
          <p className="eyebrow">{session.user.name}</p>
          <h1>{t.accountTitle}</h1>
          <p>{t.accountText}</p>
        </div>
        <div>
          {session.user.isAdmin && (
            <Link className="button secondary" to="/admin">
              <ShieldCheck size={16} />
              {t.admin}
            </Link>
          )}
          <button className="text-link" onClick={logout}>
            <LogOut size={15} />
            {t.signOut}
          </button>
        </div>
      </div>
      {error && <ErrorState error={error} />}
      <h2>{t.yourCollections}</h2>
      <div className="account-collections">
        {catalog.map((exam) => (
          <Link
            className={`account-collection ${exam.id}`}
            to={`/${exam.id}`}
            key={exam.id}
          >
            <ExamArt exam={exam.id} compact />
            <div>
              <h3>{exam.name}</h3>
              <span>
                {session.user.isAdmin || session.grants.includes(exam.id)
                  ? t.accessApproved
                  : session.requests.some(
                        (r) => r.exam === exam.id && r.status === "pending",
                      )
                    ? t.pending
                    : t.sample}
              </span>
            </div>
            <ArrowUpRight size={21} />
          </Link>
        ))}
      </div>
      <History lang={lang} />
    </main>
  );
}
function History() {
  const { t, lang } = useApp();
  const { data, error, reload } = useResource("/api/account");
  return (
    <section className="history-section">
      <h2>{t.history}</h2>
      {error ? (
        <ErrorState retry={reload} />
      ) : !data ? (
        <Loading />
      ) : data.history.length ? (
        <div className="history-table">
          {data.history.map((row) => (
            <Link to={`/results/${row.id}`} key={row.id}>
              <span className={`tag ${row.exam}`}>
                {row.exam.toUpperCase()}
              </span>
              <span>
                {testLabel(row.test_number, t, row.exam)}
                <small>
                  {new Date(row.finished_at).toLocaleDateString(
                    lang === "mn" ? "mn-MN" : "en-GB",
                  )}
                </small>
              </span>
              <strong>
                {row.total ? `${row.score}/${row.total}` : t.selfReview}
              </strong>
              <ArrowRight size={17} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <BookOpen size={29} strokeWidth={1.2} />
          <h3>{t.emptyHistory}</h3>
          <p>{t.emptyHistoryText}</p>
          <Link className="text-link" to="/ielts/tests/sample">
            {t.tryFree}
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </section>
  );
}
function SavedResult() {
  const { id } = useParams();
  const { catalog } = useApp();
  const { data, error, reload } = useResource(`/api/runs/${id}/result`);
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
  return (
    <Results result={data} exam={catalog.find((e) => e.id === data.exam)} />
  );
}
function Admin() {
  const { t, session } = useApp();
  if (!session.user) return <Login />;
  if (!session.user.isAdmin) return <NotFound />;
  return <AdminPanel />;
}
function AdminPanel() {
  const { t, api, refresh } = useApp();
  const { data, error, reload } = useResource("/api/admin");
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(null),
    [revoke, setRevoke] = useState(null);
  async function act(userId, exam, action) {
    setBusy(true);
    setActionError(null);
    try {
      await api("/api/admin/access", { userId, exam, action });
      setRevoke(null);
      await refresh();
      reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-page container">
      <p className="eyebrow">STUDYROOM / ADMIN</p>
      <h1>{t.manageTitle}</h1>
      <p className="page-description">{t.manageText}</p>
      {actionError && <ErrorState error={actionError} />}
      <h2>{t.requests}</h2>
      {error ? (
        <ErrorState retry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          {data.requests.length ? (
            <div className="admin-table">
              {data.requests.map((row) => (
                <div className="admin-row" key={row.id}>
                  <div>
                    <strong>{row.name}</strong>
                    <small>{row.email}</small>
                  </div>
                  <span className={`tag ${row.exam}`}>
                    {row.exam.toUpperCase()}
                  </span>
                  <span className="status">
                    {row.status === "pending" ? t.pending : t[row.status]}
                  </span>
                  <div className="admin-actions">
                    {row.status === "pending" && (
                      <>
                        <button
                          disabled={busy}
                          className="button small secondary"
                          onClick={() => act(row.user_id, row.exam, "reject")}
                        >
                          {t.reject}
                        </button>
                        <button
                          disabled={busy}
                          className="button small"
                          onClick={() => act(row.user_id, row.exam, "approve")}
                        >
                          {t.approve}
                          <Check size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">{t.noRequests}</p>
          )}
          <h2>{t.activeAccess}</h2>
          {data.grants.length ? (
            <div className="admin-table">
              {data.grants.map((row) => (
                <div className="admin-row" key={`${row.user_id}-${row.exam}`}>
                  <div>
                    <strong>{row.name}</strong>
                    <small>{row.email}</small>
                  </div>
                  <span className={`tag ${row.exam}`}>
                    {row.exam.toUpperCase()}
                  </span>
                  <button
                    className="button small secondary"
                    disabled={busy}
                    onClick={() => setRevoke(row)}
                  >
                    {t.revoke}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">{t.noGrants}</p>
          )}
        </>
      )}
      <Modal
        open={!!revoke}
        onClose={() => !busy && setRevoke(null)}
        title={t.confirmRevoke}
      >
        <p>
          {revoke?.email} · {revoke?.exam.toUpperCase()}
        </p>
        <div className="modal-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setRevoke(null)}
          >
            {t.cancel}
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={() => act(revoke.user_id, revoke.exam, "revoke")}
          >
            {t.revoke}
          </button>
        </div>
      </Modal>
    </main>
  );
}
function NotFound() {
  const { t } = useApp();
  return (
    <main className="state-page not-found">
      <span className="eyebrow">404 / STUDYROOM</span>
      <h1>{t.notFound}</h1>
      <p>{t.notFoundText}</p>
      <Link className="button" to="/">
        {t.backHome}
        <ArrowLeft size={16} />
      </Link>
    </main>
  );
}
export default function App() {
  return (
    <Provider>
      <ScrollManager />
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Header />
      <div id="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/account" element={<Account />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/results/:id" element={<SavedResult />} />
          <Route path="/:exam" element={<ExamPage />} />
          <Route path="/:exam/guide" element={<Guide />} />
          <Route path="/:exam/tests/:number" element={<TestPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </Provider>
  );
}
