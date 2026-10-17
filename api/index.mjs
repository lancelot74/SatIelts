import { boot } from "../server/boot.mjs";

const { app } = await boot();

export default function handler(req, res) {
  const raw = req.url || "/";
  const splitAt = raw.indexOf("?");
  const pathname = splitAt === -1 ? raw : raw.slice(0, splitAt);
  const params = new URLSearchParams(splitAt === -1 ? "" : raw.slice(splitAt + 1));
  const routed = params.get("path");
  if (routed) {
    params.delete("path");
    const query = params.toString();
    req.url = `/api/${routed}${query ? `?${query}` : ""}`;
  } else if (!pathname.startsWith("/api/")) {
    const query = params.toString();
    req.url = `/api${pathname === "/" ? "" : pathname}${query ? `?${query}` : ""}`;
  }
  return app(req, res);
}
