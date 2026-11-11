export const SAVE_DEBOUNCE_MS = 1500;
export const SAVE_MAX_WAIT_MS = 5000;
export const KEEPALIVE_LIMIT = 64 * 1024;

export function byteLength(body) {
  return new TextEncoder().encode(String(body)).length;
}

// Keepalive and sendBeacon share a 64 KiB browser budget. A larger body uses
// a normal fetch, which is not tied to that budget.
export function deliveryMode(body, { unloading = false } = {}) {
  const bytes = byteLength(body);
  const fits = bytes <= KEEPALIVE_LIMIT - 1024;
  if (unloading && fits)
    return { transport: "fetch", keepalive: true, bytes, beacon: true };
  return { transport: "fetch", keepalive: false, bytes, beacon: false };
}

export function createSaveQueue() {
  let chain = Promise.resolve();
  return {
    enqueue(work) {
      const task = chain.catch(() => {}).then(work);
      chain = task;
      return task;
    },
    wait() {
      return chain.catch(() => {});
    },
  };
}

export function nextDelay(now, dirtySince, remainingMs) {
  if (!dirtySince) return SAVE_DEBOUNCE_MS;
  if (remainingMs <= 3000) return 0;
  const waited = now - dirtySince;
  if (waited >= SAVE_MAX_WAIT_MS) return 0;
  return Math.min(SAVE_DEBOUNCE_MS, SAVE_MAX_WAIT_MS - waited);
}

export async function deliverSave({
  fetchImpl,
  beacon,
  url,
  payload,
  unloading = false,
}) {
  const body = JSON.stringify(payload);
  const mode = deliveryMode(body, { unloading });
  const init = {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": payload.csrf || "",
    },
    body,
    keepalive: mode.keepalive,
    credentials: "same-origin",
  };
  try {
    const response = await fetchImpl(url, init);
    let parsed = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const error = new Error(parsed?.error || "server_error");
      error.status = response.status;
      throw error;
    }
    return { ok: true, body: parsed, mode };
  } catch (error) {
    if (unloading && mode.beacon && typeof beacon === "function") {
      const sent = beacon(url, new Blob([body], { type: "application/json" }));
      if (sent) {
        const unconfirmed = new Error("beacon_unconfirmed");
        unconfirmed.beacon = true;
        throw unconfirmed;
      }
    }
    throw error;
  }
}
