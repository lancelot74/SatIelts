// Optional shared counters in the app database. Unset RATE_LIMIT_STORE keeps
// the in-memory store. This does not call Upstash or any other paid service.
export function useDatabaseRateLimits() {
  return process.env.RATE_LIMIT_STORE === "postgres";
}

export class DatabaseRateLimitStore {
  constructor(db) {
    this.db = db;
    this.windowMs = 60000;
    this.localKeys = false;
    this.prefix = "rl";
    this.available = null;
    this.memory = new Map();
  }
  init(options) {
    this.windowMs = options.windowMs;
  }
  async probe() {
    if (this.available !== null) return this.available;
    try {
      await this.db.get("SELECT 1 AS ok FROM rate_limit_hits LIMIT 1");
      this.available = true;
    } catch {
      this.available = false;
      console.error(
        "RATE_LIMIT_STORE=postgres ignored because rate_limit_hits is missing. Using in-memory limits.",
      );
    }
    return this.available;
  }
  bucket(key) {
    const start = Math.floor(Date.now() / this.windowMs) * this.windowMs;
    return { name: `${this.prefix}:${this.windowMs}:${key}`, start };
  }
  async increment(key) {
    const { name, start } = this.bucket(key);
    const resetTime = new Date(start + this.windowMs);
    if (!(await this.probe())) {
      const hits = (this.memory.get(name) || 0) + 1;
      this.memory.set(name, hits);
      return { totalHits: hits, resetTime };
    }
    const row = await this.db.get(
      `INSERT INTO rate_limit_hits (bucket, window_start, hits) VALUES (?, ?, 1)
       ON CONFLICT(bucket, window_start) DO UPDATE SET hits = hits + 1
       RETURNING hits`,
      [name, start],
    );
    return { totalHits: Number(row?.hits || 1), resetTime };
  }
  async decrement(key) {
    const { name, start } = this.bucket(key);
    if (!(await this.probe())) {
      const hits = this.memory.get(name) || 0;
      if (hits > 0) this.memory.set(name, hits - 1);
      return;
    }
    await this.db.run(
      "UPDATE rate_limit_hits SET hits = hits - 1 WHERE bucket=? AND window_start=? AND hits>0",
      [name, start],
    );
  }
  async resetKey(key) {
    const { name, start } = this.bucket(key);
    this.memory.delete(name);
    if (!(await this.probe())) return;
    await this.db.run(
      "DELETE FROM rate_limit_hits WHERE bucket=? AND window_start=?",
      [name, start],
    );
  }
}
