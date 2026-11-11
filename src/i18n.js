import { mn } from "./i18n-mn.js";

const loaded = { mn };

export function loadLanguage(lang) {
  if (lang !== "en") return Promise.resolve(mn);
  if (loaded.en) return Promise.resolve(loaded.en);
  return import("./i18n-en.js").then((mod) => {
    loaded.en = mod.en;
    return mod.en;
  });
}

export { mn };
