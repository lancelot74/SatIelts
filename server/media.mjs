import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("public/media");

export function mediaTarget(exam, set, file) {
  if (!/^(ielts|toefl|sat)$/.test(exam)) return null;
  if (!/^[a-z0-9-]{1,40}$/i.test(set)) return null;
  if (!/^[a-z0-9._-]{1,80}$/i.test(file) || !file.endsWith(".mp3")) return null;
  const target = path.resolve(ROOT, exam, set, file);
  if (!target.startsWith(ROOT + path.sep)) return null;
  return target;
}

export function sendMedia(req, res, file) {
  const stat = fs.statSync(file);
  let start = 0;
  let end = stat.size - 1;
  res.set("Cache-Control", "private, no-store");
  res.set("Accept-Ranges", "bytes");
  res.type("audio/mpeg");
  if (req.headers.range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    const size = stat.size;
    if (!match) {
      res.status(416).set("Content-Range", `bytes */${size}`).end();
      return;
    }
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : Math.min(start + 1024 * 1024 - 1, size - 1);
    if (start >= size || end < start) {
      res.status(416).set("Content-Range", `bytes */${size}`).end();
      return;
    }
    end = Math.min(end, size - 1);
    res.status(206);
    res.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  res.set("Content-Length", String(end - start + 1));
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file, { start, end }).pipe(res);
}
