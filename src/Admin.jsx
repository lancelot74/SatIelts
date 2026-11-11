import { useState } from "react";
import { Check } from "lucide-react";
import {
  ErrorState,
  Loading,
  Login,
  Modal,
  NotFound,
  planKey,
  useApp,
  useResource,
} from "./App.jsx";

function AdminPanel() {
  const { t, api, refresh } = useApp();
  const { data, error, reload } = useResource("/api/admin");
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(null),
    [revoke, setRevoke] = useState(null);
  async function act(userId, exam, action, days) {
    setBusy(true);
    setActionError(null);
    try {
      const note =
        action === "approve"
          ? window.prompt(t.approveNote)
          : "Revoked from the admin page";
      if (!note || note.trim().length < 3) return;
      await api("/api/admin/access", {
        userId,
        exam,
        action,
        days,
        note: note.trim(),
      });
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
      {data?.orders?.some((order) => order.status === "awaiting_payment") && (
        <section>
          <h2>{t.waitingPayment}</h2>
          {data.orders
            .filter((order) => order.status === "awaiting_payment")
            .map((order) => (
              <div className="admin-row" key={order.code}>
                <div>
                  <strong>{order.code}</strong>
                  <small>
                    {order.email} · {order.plan} · {order.group_size} ·{" "}
                    {order.amount_mnt}
                  </small>
                </div>
                <button
                  className="button small"
                  disabled={busy}
                  onClick={async () => {
                    const note = window.prompt(t.approveNote);
                    if (!note || note.trim().length < 3) return;
                    setBusy(true);
                    try {
                      await api("/api/admin/orders/approve", {
                        code: order.code,
                        note: note.trim(),
                      });
                      await refresh();
                      reload();
                    } catch (e) {
                      setActionError(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t.confirmPayment}
                </button>
                {order.status === "paid" && (
                  <button
                    className="button small secondary"
                    onClick={() =>
                      setRevoke({ user_id: order.user_id, exam: "all" })
                    }
                  >
                    {t.revoke}
                  </button>
                )}
              </div>
            ))}
        </section>
      )}
      {data?.orders?.some((order) => order.status === "paid") && (
        <section>
          <h2>{t.paidUntil}</h2>
          {data.orders
            .filter((order) => order.status === "paid")
            .map((order) => (
              <div className="admin-row" key={order.code}>
                <div>
                  <strong>{order.code}</strong>
                  <small>
                    {order.email} · {order.amount_mnt}
                    {order.ends_at
                      ? ` · ${new Date(Number(order.ends_at)).toLocaleString()}`
                      : ""}
                  </small>
                </div>
                <button
                  className="button small secondary"
                  disabled={busy}
                  onClick={() =>
                    setRevoke({
                      code: order.code,
                      email: order.email,
                      exam: "all",
                    })
                  }
                >
                  {t.revoke}
                </button>
              </div>
            ))}
        </section>
      )}
      {data?.sms?.length > 0 && (
        <section>
          <h2>{t.unmatchedSms}</h2>
          {data.sms.map((event) => (
            <div className="admin-row" key={event.id}>
              <div>
                <strong>{event.order_code || event.unmatched_reason}</strong>
                <small>
                  {event.account_masked || "—"} · {event.amount_mnt ?? "—"} ·{" "}
                  {event.utga || "—"} ·{" "}
                  {new Date(event.server_received_at).toLocaleString()}
                </small>
              </div>
              <button
                className="button small secondary"
                disabled={busy}
                onClick={async () => {
                  const note = window.prompt(t.approveNote);
                  if (!note || note.trim().length < 3) return;
                  setBusy(true);
                  try {
                    await api("/api/admin/sms/dismiss", {
                      id: event.id,
                      note: note.trim(),
                    });
                    reload();
                  } catch (e) {
                    setActionError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t.smsDismiss}
              </button>
              <button
                className="button small"
                disabled={busy}
                onClick={async () => {
                  const code = window.prompt(t.smsLinkCode);
                  if (!code) return;
                  const note = window.prompt(t.approveNote);
                  if (!note || note.trim().length < 3) return;
                  setBusy(true);
                  try {
                    await api("/api/admin/sms/link", {
                      id: event.id,
                      code: code.trim(),
                      note: note.trim(),
                    });
                    await refresh();
                    reload();
                  } catch (e) {
                    setActionError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t.smsLink}
              </button>
            </div>
          ))}
        </section>
      )}
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
                  <span
                    className={`tag ${row.exam === "all" ? "sat" : row.exam}`}
                  >
                    {row.exam === "all" ? t.allExams : row.exam.toUpperCase()}
                    {row.plan ? ` · ${t[planKey(row.plan)]}` : ""}
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
                          className="button small secondary"
                          onClick={() =>
                            act(row.user_id, row.exam, "approve", 7)
                          }
                        >
                          {t.approveWeek}
                        </button>
                        <button
                          disabled={busy}
                          className="button small"
                          onClick={() =>
                            act(row.user_id, row.exam, "approve", 30)
                          }
                        >
                          {t.approveMonth}
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
          {data.access?.length ? (
            <div className="admin-table">
              {data.access.map((row) => (
                <div className="admin-row" key={row.id}>
                  <div>
                    <strong>{row.name || row.email}</strong>
                    <small>
                      {row.email}
                      {row.code ? ` · ${row.code}` : ""} ·{" "}
                      {new Date(Number(row.ends_at)).toLocaleString()}
                    </small>
                  </div>
                  {!row.order_id && row.user_id && (
                    <button
                      className="button small secondary"
                      disabled={busy}
                      onClick={() =>
                        setRevoke({
                          user_id: row.user_id,
                          email: row.email,
                          exam: "all",
                        })
                      }
                    >
                      {t.revoke}
                    </button>
                  )}
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
            onClick={() =>
              revoke.code
                ? (async () => {
                    setBusy(true);
                    try {
                      await api("/api/admin/orders/revoke", {
                        code: revoke.code,
                        note: "Revoked from the admin page",
                      });
                      setRevoke(null);
                      reload();
                    } catch (e) {
                      setActionError(e);
                    } finally {
                      setBusy(false);
                    }
                  })()
                : act(revoke.user_id, revoke.exam, "revoke")
            }
          >
            {t.revoke}
          </button>
        </div>
      </Modal>
    </main>
  );
}

function Admin() {
  const { t, session } = useApp();
  if (!session.user) return <Login />;
  if (!session.user.isAdmin) return <NotFound />;
  return <AdminPanel />;
}

export default Admin;
