// A stuck API must become the error card. Three silent retries of a hung
// socket would leave the page on the loading state.
const RETRIES = 3;

export async function request(url, options = {}) {
  const { timeoutMs = 12000, ...rest } = options;
  const headers = { ...rest.headers };
  if (rest.body != null) headers["Content-Type"] = "application/json";
  let lastError;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...rest,
        headers,
        signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
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
      const timedOut =
        error?.name === "TimeoutError" || error?.name === "AbortError";
      if (timedOut || attempt === RETRIES - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}
