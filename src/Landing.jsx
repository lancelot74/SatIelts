import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Clock3,
  Copy,
  Languages,
  Smartphone,
  Timer,
} from "lucide-react";
import { useApp } from "./App.jsx";
import { formatTugrik, offer, SALE_END } from "./config/pricing.js";

const PHONES = ["99292667", "95331981"];

export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function Countdown({ end, now }) {
  const { t } = useApp();
  const left = Math.max(0, end - now);
  if (!left) return null;
  const minutes = Math.floor(left / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return (
    <span className="countdown">
      {days}
      <small>{t.cdDay}</small> {hours}
      <small>{t.cdHour}</small> {mins}
      <small>{t.cdMin}</small>
    </span>
  );
}

export function SaleBar() {
  const { t } = useApp();
  const { pathname } = useLocation();
  const now = useNow();
  const prices = offer(now);
  if (!prices.sale || /^\/(ielts|toefl|sat)\/tests\/.+/.test(pathname))
    return null;
  return (
    <a className="sale-bar" href="/#pricing">
      <span>★ {t.saleBar}</span>
      <Countdown end={SALE_END} now={now} />
    </a>
  );
}

function Price({ list, price, sale }) {
  return (
    <span className="price-pair">
      {sale && list !== price && (
        <s>{formatTugrik(list)}</s>
      )}
      <strong>{formatTugrik(price)}</strong>
    </span>
  );
}

export function Landing() {
  const { t, catalog, session } = useApp();
  const now = useNow();
  const prices = offer(now);
  const [group, setGroup] = useState("1");
  const [copied, setCopied] = useState(false);
  const plans = group === "3" ? prices.friends : prices.solo;
  const shareUrl = `${window.location.origin}/?group=3`;

  function choose(plan) {
    const query = new URLSearchParams({ plan, group });
    const checkout = `/checkout?${query}`;
    return session.user
      ? checkout
      : `/login?next=${encodeURIComponent(checkout)}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="landing">
      <section className="land-hero bg-horizon container">
        <div>
          <p className="eyebrow">{t.landEyebrow}</p>
          <h1>{t.heroTitle}</h1>
          <p className="land-sub">{t.heroSub}</p>
          <div className="hero-actions">
            <a className="button" href="#exams">
              {t.startFree}
              <ArrowRight size={17} />
            </a>
            <a className="button secondary" href="#pricing">
              {t.seePrices}
            </a>
          </div>
          <p className="land-price-line">
            {t.soloLabel}: {t.planWeek}{" "}
            <Price
              list={prices.solo.week.list}
              price={prices.solo.week.price}
              sale={prices.sale}
            />
            {" · "}
            {t.planMonth}{" "}
            <Price
              list={prices.solo.month.list}
              price={prices.solo.month.price}
              sale={prices.sale}
            />
          </p>
          <p className="fine">
            <Check size={14} />
            {t.freeNote}
          </p>
        </div>
        <div className="land-demo" aria-hidden="true">
          <div className="practice-paper">
            <div className="paper-top">
              <span>{t.demoLabel}</span>
              <span className="demo-timer">
                <Timer size={14} /> 12:48
              </span>
            </div>
            <div className="paper-exam">
              <span className="tag sat">SAT</span>
              <span>READING & WRITING</span>
            </div>
            <p lang="en" className="demo-question">
              {t.dailyPrompt}
            </p>
            <div className="demo-choices">
              {["are", "were", "is", "have been"].map((choice, i) => (
                <span key={choice}>
                  <b>{"ABCD"[i]}</b>
                  {choice}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container land-section" id="exams">
        <div className="section-heading">
          <h2>{t.examPicker}</h2>
          <p>{t.weeklyNote}</p>
        </div>
        <div className="exam-cards">
          {catalog.map((exam) => {
            const sample = exam.modes?.[0]?.sample;
            return (
              <article className={`exam-card ${exam.id}`} key={exam.id}>
                <div className="exam-card-body">
                  <h3>{exam.name}</h3>
                  <p>
                    {exam.count} {t.practiceSets}
                    {sample
                      ? ` · ${sample.minutes} ${t.minutes} · ${sample.count} ${t.questions}`
                      : ""}
                  </p>
                  <p className="fine">{t.noSignup}</p>
                  <Link
                    className="button"
                    to={
                      sample
                        ? `/${exam.id}/tests/${sample.number}`
                        : `/${exam.id}`
                    }
                  >
                    {t.startFree}
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="container land-section">
        <h2>{t.how}</h2>
        <div className="how-steps">
          {[1, 2, 3].map((n) => (
            <article key={n}>
              <span className="step-number">0{n}</span>
              <h3>{t[`landStep${n}`]}</h3>
              <p>{t[`landStep${n}Text`]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container land-section benefit-grid">
        {[
          [Timer, t.benefit1, t.benefit1Text],
          [Clock3, t.benefit2, t.benefit2Text],
          [Smartphone, t.benefit3, t.benefit3Text],
          [Languages, t.benefit4, t.benefit4Text],
        ].map(([Icon, title, body]) => (
          <article key={title}>
            <Icon size={22} />
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <section className="container land-section" id="pricing">
        <div className="section-heading">
          <h2>{t.pricingTitle}</h2>
          <p>{t.onePlan}</p>
        </div>
        <div className="plan-toggle" role="group" aria-label={t.pricingTitle}>
          <button
            className={group === "1" ? "active" : ""}
            aria-pressed={group === "1"}
            onClick={() => setGroup("1")}
          >
            {t.solo}
          </button>
          <button
            className={group === "3" ? "active" : ""}
            aria-pressed={group === "3"}
            onClick={() => setGroup("3")}
          >
            {t.friendsSet}
          </button>
        </div>
        <div className="price-cards">
          {["week", "month"].map((plan) => {
            const row = plans[plan];
            const each = group === "3" ? row.each : row.price;
            const total = group === "3" ? row.total : row.price;
            const list = group === "3" ? row.listTotal : row.list;
            return (
              <article
                key={plan}
                className={plan === "month" ? "price-card featured" : "price-card"}
              >
                {plan === "month" && <span className="card-flag">{t.forRegular}</span>}
                <h3>{plan === "week" ? t.planWeek : t.planMonth}</h3>
                <p className="price-main">
                  {prices.sale && <s>{formatTugrik(list)}</s>}
                  <strong>{formatTugrik(total)}</strong>
                </p>
                {group === "3" && (
                  <p>
                    {t.payTotal}: {formatTugrik(total)} · {t.perPerson}{" "}
                    {formatTugrik(each)} · {t.youPlus}
                  </p>
                )}
                <Link className="button" to={choose(plan)}>
                  {t.getAccess}
                  <ArrowRight size={16} />
                </Link>
              </article>
            );
          })}
        </div>
        <p className="stack-note">{t.stackNote}</p>
        <ol className="pay-steps">
          <li>{t.pay1}</li>
          <li>{t.pay2}</li>
          <li>{t.pay3}</li>
        </ol>
      </section>

      <section className="container land-section friends-block">
        <div>
          <h2>{t.friendsTitle}</h2>
          <p>{t.friendsText}</p>
        </div>
        <div className="hero-actions">
          <button className="button secondary" onClick={copyLink}>
            <Copy size={16} />
            {copied ? t.copied : t.copyLink}
          </button>
          <a
            className="button secondary"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noreferrer"
          >
            {t.share}
          </a>
        </div>
      </section>

      <section className="container land-section">
        <h2>{t.parentsTitle}</h2>
        <p>{t.parentsText}</p>
        <p>
          {PHONES.map((phone) => (
            <a key={phone} className="text-link" href={`tel:+976${phone}`}>
              {phone}
            </a>
          ))}
        </p>
        <p className="fine">{t.independent}</p>
      </section>

      <section className="container land-section" id="faq">
        <h2>{t.faqTitle}</h2>
        <div className="faq-list">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <details key={n}>
              <summary>{t[`faq${n}q`]}</summary>
              <p>{t[`faq${n}a`]}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="land-final">
        <div className="container">
          <h2>{t.finalTitle}</h2>
          {prices.sale && <Countdown end={SALE_END} now={now} />}
          <div className="hero-actions">
            <a className="button" href="#exams">
              {t.startFree}
              <ArrowRight size={17} />
            </a>
            <a className="button secondary" href="#pricing">
              {t.seePrices}
            </a>
          </div>
        </div>
      </section>
      <a className="sticky-free" href="#exams">
        {t.startFree}
      </a>
    </main>
  );
}
