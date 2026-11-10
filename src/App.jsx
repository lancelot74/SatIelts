import React, {
  createContext,
  lazy,
  Suspense,
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
import { Landing, SaleBar } from "./Landing.jsx";
import { request } from "./request.js";
const Checkout = lazy(() =>
  import("./Checkout.jsx").then((mod) => ({ default: mod.Checkout })),
);
const Admin = lazy(() => import("./Admin.jsx"));
const TestPage = lazy(() => import("./TestRunner.jsx"));
import { formatTugrik, offer, planCode } from "./config/pricing.js";
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
import { loadLanguage, mn } from "./i18n.js";
import { PracticeAudio, VoiceResponse } from "./PracticeMedia.jsx";
const STOCK_MN = "Энэ шинэ сорилын асуулт англи хэл дээр.";
export function mnCopy(value) {
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
export const sectionText = (section, t) =>
  ({
    Reading: t.reading,
    "Reading & Writing": t.readingWriting,
    Math: t.math,
    Listening: t.listening,
    Writing: t.writing,
    Speaking: t.speaking,
  })[section] || section;
export function testLabel(number, t, examId) {
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
export const useApp = () => useContext(Context);
export function useResource(url) {
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
    [pack, setPack] = useState(mn),
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
    let alive = true;
    loadLanguage(lang).then((next) => {
      if (alive) setPack(next);
    });
    return () => {
      alive = false;
    };
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
    t: pack,
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
export function Loading() {
  const { t } = useApp();
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      {t.loading}
    </div>
  );
}
export function ErrorState({ retry, error }) {
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
      <picture>
        <source srcSet="/logo.webp" type="image/webp" />
        <img className="logo-mark" src="/logo.png" alt="" />
      </picture>
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
          <a href="/#pricing">{t.navPrice}</a>
          <a href="/#faq">{t.navFaq}</a>
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
          <a href="tel:+97699292667">99292667</a>
          <a href="tel:+97695331981">95331981</a>
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
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
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
  return (
    <>
      <Landing />
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
              (mode.id === "full" && id !== "sat")) && <p>{t.deviceListen}</p>}
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
                      <span className="row-score">
                        {latestMark(test.number)}
                      </span>
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
                <p>
                  {bookMode.tests.length} {t.fullCount}
                  {id !== "sat" ? ` ${t.deviceListen}` : ""}
                </p>
              </div>
            </div>
            <div
              className="practice-modes"
              role="group"
              aria-label={t.fullLength}
            >
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
                      <span className="row-score">
                        {latestMark(test.number)}
                      </span>
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
export function Breadcrumb({ exam, current }) {
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
export function Locked({ exam, number = "reading-1" }) {
  const { t, session, api, refresh } = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const pending = session.requests.some(
    (r) => (r.exam === "all" || r.exam === exam.id) && r.status === "pending",
  );
  async function ask() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/access-requests", { exam: "all", plan: "month" });
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
            <Link className="button" to="/checkout?plan=month&group=1">
              {t.getAccess}
              <ArrowRight size={17} />
            </Link>
          ) : (
            <Link
              className="button"
              to={`/login?next=${encodeURIComponent("/checkout?plan=month&group=1")}`}
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
export function Login() {
  const { t, session } = useApp();
  const [params] = useSearchParams();
  if (session.user) return <Account />;
  const next = params.get("next") || "/account";
  const plan =
    params.get("plan") === "week" || params.get("plan") === "month"
      ? params.get("plan")
      : "";
  const group = params.get("group") === "3" ? "3" : "";
  const authQuery = new URLSearchParams({ next });
  if (plan) authQuery.set("plan", plan);
  if (group) authQuery.set("group", group);
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
            href={`/api/auth/google?${authQuery}`}
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
export function Modal({ open, onClose, title, children }) {
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
function suggestedNext(catalog, examId, number) {
  const entry = catalog?.find((item) => item.id === examId);
  if (!entry) return null;
  for (const mode of [...(entry.modes || []), ...(entry.books || [])]) {
    const list = [mode.sample, ...(mode.tests || [])].filter(Boolean);
    const index = list.findIndex(
      (item) => String(item.number) === String(number),
    );
    if (index >= 0 && list[index + 1]) return list[index + 1];
  }
  return null;
}
function cleanGuideText(text) {
  const out = [];
  for (const raw of String(text || "")
    .replace(/\r/g, "")
    .split("\n")) {
    const line = raw.trim();
    if (!line) {
      if (out.at(-1) !== "") out.push("");
      continue;
    }
    if (/гарын авлага/i.test(line) && line.length < 90) continue;
    if (/^\d{1,3}$/.test(line)) continue;
    const prev = out.at(-1);
    const join =
      prev &&
      prev.length > 48 &&
      !/[.?!…:]$/.test(prev) &&
      !/^[-•–]/.test(line) &&
      !/^\d+[\).]/.test(line);
    if (join) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out.join("\n");
}
export function Results({ result, exam, onRetake }) {
  const { t, tr, lang, session, catalog } = useApp();
  const [showMn, setShowMn] = useState(false);
  const next = suggestedNext(catalog, exam.id, result.number);
  const unlocked = session.user?.isAdmin || session.grants?.includes(exam.id);
  const prices = offer();
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
      <div className="results-follow">
        {next && (
          <article className="price-card">
            <h2>{t.nextTest}</h2>
            <p>
              {next.minutes} {t.minutes} · {next.count} {t.questions}
            </p>
            <Link
              className="button"
              to={
                String(next.number).includes("sample") || unlocked
                  ? `/${exam.id}/tests/${next.number}`
                  : `/login?plan=month&group=1&next=/${exam.id}/tests/${next.number}`
              }
            >
              {String(next.number).includes("sample") || unlocked
                ? t.openNext
                : t.getAccess}
              <ArrowRight size={16} />
            </Link>
          </article>
        )}
        {!unlocked && (
          <article className="price-card featured">
            <h2>{t.offerTitle}</h2>
            <p>
              {t.planWeek}{" "}
              {prices.sale && <s>{formatTugrik(prices.solo.week.list)}</s>}{" "}
              <strong>{formatTugrik(prices.solo.week.price)}</strong>
              {" · "}
              {t.planMonth}{" "}
              {prices.sale && <s>{formatTugrik(prices.solo.month.list)}</s>}{" "}
              <strong>{formatTugrik(prices.solo.month.price)}</strong>
            </p>
            <p className="fine">{t.onePlan}</p>
            <Link className="button" to="/checkout?plan=month&group=1">
              {t.getAccess}
              <ArrowRight size={16} />
            </Link>
          </article>
        )}
      </div>
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
              {q.transcript && (
                <details className="review-transcript">
                  <summary>{t.transcript}</summary>
                  <p lang="en">{q.transcript}</p>
                </details>
              )}
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
            {cleanGuideText(lesson.body)}
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
export function planKey(code) {
  return (
    {
      week: "planWeek",
      month: "planMonth",
      "week-3": "planWeek3",
      "month-3": "planMonth3",
    }[code] || "planMonth"
  );
}
function Account() {
  const { session, t, catalog, api, refresh, lang } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (!session.user) return <Login />;
  const chosen = planCode(params.get("plan"), params.get("group"));
  const pendingAll = session.requests.some(
    (r) => r.exam === "all" && r.status === "pending",
  );
  useEffect(() => {
    const plan = params.get("plan");
    if (plan === "week" || plan === "month") {
      navigate(
        `/checkout?plan=${plan}&group=${params.get("group") === "3" ? "3" : "1"}`,
        { replace: true },
      );
    }
  }, [params, navigate]);
  async function logout() {
    try {
      await api("/api/logout");
      await refresh();
      navigate("/");
    } catch (e) {
      setError(e);
    }
  }
  async function requestPlan() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/access-requests", { exam: "all", plan: chosen });
      await refresh();
      setSent(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
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
      {chosen && (
        <section className="notice">
          <div>
            <strong>{t.chosenPlan}</strong>
            <p>{t[planKey(chosen)]}</p>
          </div>
          {pendingAll || sent ? (
            <p>{t.pendingDetail}</p>
          ) : (
            <button className="button" disabled={busy} onClick={requestPlan}>
              {busy ? t.loading : t.getAccess}
            </button>
          )}
        </section>
      )}
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
                  : pendingAll ||
                      session.requests.some(
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
      <Sessions />
      <History lang={lang} />
    </main>
  );
}
function Sessions() {
  const { t, session, api, refresh } = useApp();
  if (!session?.user) return null;
  return (
    <section>
      <h2>{t.sessionsTitle}</h2>
      <p className="fine">{t.sessionGoogle}</p>
      {session.notices?.map((notice) => (
        <p className="notice" key={notice.id}>
          {notice.kind === "group_revoked"
            ? notice.separate
              ? t.revokeKept
              : t.revokeRenew
            : notice.kind === "unusual_place"
              ? t.unusualPlace
              : t.excessLogin}
        </p>
      ))}
      {session.sessions?.map((row) => (
        <div className="admin-row" key={row.id}>
          <div>
            <strong>
              {row.label}
              {row.current ? ` · ${t.thisSession}` : ""}
            </strong>
            <small>
              {row.network} · {new Date(row.createdAt).toLocaleString()}
            </small>
          </div>
        </div>
      ))}
      {session.sessions?.length > 1 && (
        <button
          className="button small secondary"
          onClick={async () => {
            await api("/api/sessions/others", {});
            await refresh();
          }}
        >
          {t.signOutOthers}
        </button>
      )}
    </section>
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
export function NotFound() {
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
      <SaleBar />
      <Header />
      <div id="main-content">
        <Suspense
          fallback={
            <main className="state-page">
              <div className="loading" role="status">
                <span className="spinner" />
              </div>
            </main>
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/checkout/:code" element={<Checkout />} />
            <Route path="/account" element={<Account />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/results/:id" element={<SavedResult />} />
            <Route path="/:exam" element={<ExamPage />} />
            <Route path="/:exam/guide" element={<Guide />} />
            <Route path="/:exam/tests/:number" element={<TestPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </div>
    </Provider>
  );
}
