import postgres from "postgres";
import { postgresSsl } from "../server/db.mjs";
import { runMigrations } from "../server/migrate.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "Set DATABASE_URL, then run npm run migrate. The URL is not printed.",
  );
  process.exit(1);
}

const sql = postgres(connectionString, {
  max: 1,
  prepare: false,
  ssl: postgresSsl(connectionString),
  idle_timeout: 20,
  connect_timeout: 30,
  onnotice() {},
});

try {
  await runMigrations(sql);
  console.log("Migrations applied.");
} catch (error) {
  const message = String(error?.message || error?.name || "error").replace(
    /postgres(?:ql)?:\/\/\S+/gi,
    "postgres://redacted",
  );
  console.error(
    "Migration failed:",
    error?.code || error?.name || "error",
    message,
  );
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
