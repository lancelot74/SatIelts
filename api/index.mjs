import { createBootGate } from "../server/boot-gate.mjs";
import { boot } from "../server/boot.mjs";

const ready = createBootGate({
  boot: async () => (await boot()).app,
});

export default async function handler(req, res) {
  const result = await ready();
  if (!result.app) {
    res.statusCode = result.error?.retry ? 503 : 500;
    res.setHeader("content-type", "application/json");
    if (result.error?.retry) res.setHeader("retry-after", "5");
    res.end(JSON.stringify(result.error));
    return;
  }
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
  return result.app(req, res);
}
