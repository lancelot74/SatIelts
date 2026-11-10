const MIGRATION_BACKOFF_MS = 5000;

export function redactBootError(error) {
  const raw = String(error?.message || error?.name || "error");
  const migration = raw.includes("migration required");
  return {
    error: migration ? "migration_required" : "boot_failed",
    name: error?.name || "Error",
    code: error?.code || null,
    detail: raw
      .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://redacted")
      .slice(0, 180),
    retry: migration,
  };
}

// A missing migration is retried on a later request. Any other boot failure
// stays failed for this process.
export function createBootGate({
  boot,
  now = Date.now,
  backoffMs = MIGRATION_BACKOFF_MS,
}) {
  let app = null;
  let failure = null;
  let retryAt = 0;
  return async function ready() {
    if (app) return { app };
    const time = now();
    if (failure && (!failure.retry || time < retryAt)) return { error: failure };
    try {
      app = await boot();
      failure = null;
      return { app };
    } catch (error) {
      failure = redactBootError(error);
      retryAt = time + backoffMs;
      return { error: failure };
    }
  };
}
