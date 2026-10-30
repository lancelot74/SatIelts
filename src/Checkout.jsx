import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Check, Copy } from "lucide-react";
import { useApp } from "./App.jsx";
import { formatIban, payment } from "./config/payment.js";
import { formatTugrik, priceFor } from "./config/pricing.js";

function CopyButton({ value, label, copiedLabel }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="button secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? copiedLabel : label}
    </button>
  );
}

export function Checkout() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const { session } = useApp();
  const next = code
    ? `/checkout/${code}`
    : `/checkout?plan=${params.get("plan") || "month"}&group=${params.get("group") || "1"}`;
  if (!session.user) {
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    return null;
  }
  return code ? <PayStatus code={code} /> : <ConfirmPlan />;
}

function ConfirmPlan() {
  const { t, api } = useApp();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const plan = params.get("plan") === "week" ? "week" : "month";
  const group = params.get("group") === "3" ? "3" : "1";
  const [friends, setFriends] = useState(["", ""]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const priced = priceFor(plan, group);

  function setPlan(nextPlan, nextGroup) {
    setParams({ plan: nextPlan, group: nextGroup }, { replace: true });
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const order = await api("/api/orders", {
        plan,
        group,
        friends: group === "3" ? friends : [],
      });
      navigate(`/checkout/${order.code}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="checkout container">
      <h1>{t.checkoutTitle}</h1>
      <p>{t.onePlan}</p>
      <div className="plan-toggle" role="radiogroup" aria-label={t.pricingTitle}>
        <button aria-pressed={group === "1"} onClick={() => setPlan(plan, "1")}>
          {t.solo}
        </button>
        <button aria-pressed={group === "3"} onClick={() => setPlan(plan, "3")}>
          {t.friendsSet}
        </button>
      </div>
      <div className="price-cards">
        {["week", "month"].map((item) => (
          <button
            key={item}
            className={plan === item ? "price-card featured" : "price-card"}
            aria-pressed={plan === item}
            onClick={() => setPlan(item, group)}
          >
            <h2>{item === "week" ? t.planWeek : t.planMonth}</h2>
            <strong>{formatTugrik(priceFor(item, group).amount)}</strong>
          </button>
        ))}
      </div>
      {group === "3" && (
        <div className="friend-emails">
          <p>{t.friendEmails}</p>
          {friends.map((email, index) => (
            <input
              key={index}
              type="email"
              value={email}
              aria-label={`${t.friendEmails} ${index + 1}`}
              onChange={(event) =>
                setFriends((current) =>
                  current.map((value, i) =>
                    i === index ? event.target.value : value,
                  ),
                )
              }
            />
          ))}
          <p>
            {t.payTotal}: {formatTugrik(priced.amount)} · {t.perPerson}{" "}
            {formatTugrik(priced.each)}
          </p>
        </div>
      )}
      {error && <p className="notice error">{error}</p>}
      <button className="button" disabled={busy} onClick={create}>
        {t.createOrder}
      </button>
    </main>
  );
}

function PayStatus({ code }) {
  const { t, api } = useApp();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    let timer;
    async function load() {
      try {
        const next = await api(`/api/orders/${code}`, undefined, "GET");
        if (!alive) return;
        setOrder(next);
        setError(null);
        if (next.status === "awaiting_payment")
          timer = setTimeout(load, 5000);
      } catch (e) {
        if (alive) setError(e.message);
      }
    }
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [api, code]);
  if (!order) return <main className="state-page">{error || t.loading}</main>;
  return (
    <main className="checkout container">
      <p className="overline">{t.transferNote}</p>
      <h1 className="order-code">{order.code}</h1>
      <CopyButton value={order.code} label={t.copyLink} copiedLabel={t.copied} />
      <p className="notice">{t.codeWarning}</p>
      <section className="price-card">
        <p>
          {t.bankName}: {payment.bank.nameMn}
        </p>
        <p>
          {t.iban}: {formatIban()}
        </p>
        <CopyButton
          value={payment.bank.iban}
          label={t.copyLink}
          copiedLabel={t.copied}
        />
        <p>
          {t.accountHolder}: {payment.bank.holder}
        </p>
        <p>
          {t.amount}: {formatTugrik(order.amount)}
        </p>
        <CopyButton
          value={String(order.amount)}
          label={t.copyLink}
          copiedLabel={t.copied}
        />
      </section>
      <p role="status">
        {order.status === "paid" ? t.paid : t.waitingPayment}
      </p>
      {order.status === "paid" && (
        <Link className="button" to="/ielts">
          {t.startFree}
        </Link>
      )}
    </main>
  );
}
