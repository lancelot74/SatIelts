import { boot } from "../server/boot.mjs";

const { app } = await boot();

export default function handler(req, res) {
  const url = req.url || "/";
  if (!url.startsWith("/api")) {
    const parts = Array.isArray(req.query?.path)
      ? req.query.path
      : req.query?.path
        ? [req.query.path]
        : [];
    const search = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    req.url = `/api${parts.length ? `/${parts.join("/")}` : ""}${search}`;
  }
  return app(req, res);
}
