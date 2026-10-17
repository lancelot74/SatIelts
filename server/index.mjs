import { boot } from "./boot.mjs";

const { app, db, databaseUrl } = await boot();
const server = app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log(
    `Studyroom API listening on port ${process.env.PORT || 3001}; database ${databaseUrl ? "postgres" : "sqlite"}; Google sign-in ${process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? "configured" : "not configured"}`,
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      Promise.resolve(db.close()).finally(() => process.exit(0));
    }),
  );
