let app;
// A failed boot stays failed for this process. The next request does not try again.
let bootError;
try {
  const loaded = await import("../server/boot.mjs");
  ({ app } = await loaded.boot());
} catch (error) {
  const raw = String(error?.message || error?.name || "error");
  bootError = {
    error: "boot_failed",
    name: error?.name || "Error",
    code: error?.code || null,
    detail: raw.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://redacted").slice(0, 180),
  };
}

export default function handler(req, res) {
  if (bootError) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(bootError));
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
  return app(req, res);
}
