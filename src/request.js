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

function deadline(timeoutMs, caller) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onCaller = () => controller.abort();
  if (caller) {
    if (caller.aborted) controller.abort();
    else caller.addEventListener("abort", onCaller);
  }
  return {
    signal: controller.signal,
    stop() {
      clearTimeout(timer);
      caller?.removeEventListener("abort", onCaller);
    },
  };
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
      lastError = error;
      if (gaveUp(error, clock.signal) || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    } finally {
      clock.stop();
    }
  }
  throw lastError;
}
