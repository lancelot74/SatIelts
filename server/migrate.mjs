import fs from "node:fs";
import path from "node:path";

// Same lock widenMillis already uses. Transaction-scoped, so the pooler can take it.
export const MIGRATION_LOCK = 814763219;
export const MIGRATIONS_DIR = path.resolve("migrations");

export function migrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      id: name.replace(/\.sql$/, ""),
      path: path.join(MIGRATIONS_DIR, name),
    }));
}

export function expectedMigration() {
  const files = migrationFiles();
  if (!files.length) throw new Error("no migration files");
  return files[files.length - 1].id;
}

// Semicolons inside dollar quotes belong to the function body, not the script.
export function splitSql(sql) {
  const statements = [];
  let current = "";
  let i = 0;
  let dollar = null;
  while (i < sql.length) {
    if (!dollar && sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    const char = sql[i];
    if (!dollar && char === "'") {
      current += char;
      i += 1;
      while (i < sql.length) {
        current += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            current += sql[i + 1];
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (!dollar && char === "$") {
      const match = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (match) {
        dollar = match[0];
        current += match[0];
        i += match[0].length;
        continue;
      }
    } else if (dollar && sql.startsWith(dollar, i)) {
      current += dollar;
      i += dollar.length;
      dollar = null;
      continue;
    }
    if (!dollar && char === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      i += 1;
      continue;
    }
    current += char;
    i += 1;
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function applyFiles(tx) {
  await tx.unsafe(
    "select set_config('lock_timeout', '8000', true), set_config('statement_timeout', '60000', true)",
  );
  await tx.unsafe(`select pg_advisory_xact_lock(${MIGRATION_LOCK})`);
  await tx.unsafe(
    `create table if not exists public.schema_migrations (
       id text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  await tx.unsafe(
    "alter table public.schema_migrations enable row level security",
  );
  for (const file of migrationFiles()) {
    const found =
      await tx`select id from public.schema_migrations where id = ${file.id}`;
    if (found.length) continue;
    const body = fs.readFileSync(file.path, "utf8");
    for (const statement of splitSql(body)) await tx.unsafe(statement);
    await tx`insert into public.schema_migrations (id) values (${file.id})`;
  }
}

export async function runMigrations(sql) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await sql.begin(async (tx) => applyFiles(tx));
      return;
    } catch (error) {
      last = error;
      if (
        attempt === 2 ||
        (error.code !== "23505" &&
          error.code !== "40P01" &&
          error.code !== "55P03")
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  throw last;
}

export async function assertMigrated(sql) {
  const id = expectedMigration();
  try {
    const rows =
      await sql`select id from public.schema_migrations where id = ${id}`;
    if (rows.length) return;
  } catch (error) {
    if (error.code !== "42P01" && error.code !== "3F000") throw error;
  }
  console.error(
    `Database is not at migration ${id}. Run npm run migrate against this database. This process will not change the schema.`,
  );
  throw new Error(`migration required: ${id}`);
}
