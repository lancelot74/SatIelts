// Reads can be repeated. A mutation that timed out may already have committed,
// so it is not sent again. The deadline is our own timer because
// AbortSignal.timeout is missing in older browsers. A caller signal does not
// replace that deadline.
const READ_ATTEMPTS = 3;

export function gaveUp(error, signal) {
  if (signal?.aborted) return true;
  const name = error?.name;
  return name === "AbortError" || name === "TimeoutError" || error?.code === 20;
}

function abortReason(signal, fallback) {
  if (signal?.reason instanceof Error) return signal.reason;
  if (!fallback || fallback.name === "AbortError" || fallback.name === "TimeoutError")
    return fallback;
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

function deadline(timeoutMs, caller) {
  const controller = new AbortController();
  const timeout = new Error("request timed out");
  timeout.name = "TimeoutError";
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(timeout);
  }, timeoutMs);
  const onCaller = () => controller.abort(caller.reason);
  if (caller) {
    if (caller.aborted) controller.abort(caller.reason);
    else caller.addEventListener("abort", onCaller);
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    stop() {
      clearTimeout(timer);
      caller?.removeEventListener("abort", onCaller);
    },
  };
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const timer = setTimeout(finish, ms);
    function finish() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    function onAbort() {
      clearTimeout(timer);
      reject(abortReason(signal));
    }
    signal?.addEventListener("abort", onAbort);
  });
}

export async function request(url, options = {}) {
  const { timeoutMs, ...rest } = options;
  const method = String(rest.method || "GET").toUpperCase();
  const mutating = method !== "GET" && method !== "HEAD";
  const attempts = mutating ? 1 : READ_ATTEMPTS;
  const limit = timeoutMs ?? (mutating ? 20000 : 12000);
  const headers = { ...rest.headers };
  if (rest.body != null) headers["Content-Type"] = "application/json";
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (rest.signal?.aborted) {
      lastError = abortReason(rest.signal);
      break;
    }
    const clock = deadline(limit, rest.signal);
    try {
      const response = await fetch(url, {
        ...rest,
        method,
        headers,
        signal: clock.signal,
      });
      const value = await response.json();
      if (!response.ok) {
        const error = new Error(value.error || "server_error");
        error.status = response.status;
        throw error;
      }
      return value;
    } catch (error) {
      lastError = clock.signal.aborted ? abortReason(clock.signal, error) : error;
      if (gaveUp(lastError, clock.signal) || attempt === attempts - 1) break;
      try {
        await wait(400 * (attempt + 1), rest.signal);
      } catch (aborted) {
        lastError = aborted;
        break;
      }
    } finally {
      clock.stop();
    }
  }
  throw lastError;
}
