import fs from "node:fs";
import { samples } from "./content.mjs";
import { fullVariants } from "./full.mjs";
export const tests = JSON.parse(
  fs.readFileSync(new URL("../content/tests.json", import.meta.url), "utf8"),
);
for (const [exam, indices] of Object.entries({
  ielts: [0, 1, 2, 3, 4, 5],
  toefl: [4, 5, 6, 7, 8],
  sat: [0, 1, 3, 10, 11, 12],
})) {
  const original = tests[`${exam}-1`];
  const questions = indices.map((index, i) => ({
    ...original.questions[index],
    id: String(i),
  }));
  // Samples have hand-written explanations in both interface languages.
  const source = samples[exam];
  questions.forEach((q, i) => {
    if (source.questions[i]) q.explanation = source.questions[i].explanation;
  });
  tests[`${exam}-sample`] = {
    exam,
    number: "sample",
    minutes: exam === "ielts" ? 10 : 8,
    questions,
    source: original.source,
  };
}
export function getTest(exam, number) {
  return (
    variants[`${exam}-${number}`] ??
    tests[`${exam}-${number}`] ??
    fullVariants[`${exam}-${number}`]
  );
}
const additions = JSON.parse(
  fs.readFileSync(new URL("../content/sections.json", import.meta.url), "utf8"),
);
const label = (en, mn) => ({ en, mn });
export const practiceModes = {
  sat: [
    {
      id: "reading",
      label: label("Reading & Writing", "Унших ба бичих"),
      minutes: 13,
      sampleMinutes: 4,
    },
    {
      id: "math",
      label: label("Math", "Математик"),
      minutes: 16,
      sampleMinutes: 4,
    },
  ],
  ielts: [
    {
      id: "listening",
      label: label("Listening", "Сонсох"),
      minutes: 16,
      sampleMinutes: 4,
    },
    {
      id: "reading",
      label: label("Reading", "Унших"),
      minutes: 20,
      sampleMinutes: 10,
    },
    {
      id: "writing",
      label: label("Writing", "Бичих"),
      minutes: 60,
      sampleMinutes: 20,
    },
    {
      id: "speaking",
      label: label("Speaking", "Ярих"),
      minutes: 14,
      sampleMinutes: 4,
    },
  ],
  toefl: [
    {
      id: "reading",
      label: label("Reading", "Унших"),
      minutes: 20,
      sampleMinutes: 8,
    },
    {
      id: "listening",
      label: label("Listening", "Сонсох"),
      minutes: 10,
      sampleMinutes: 4,
    },
    {
      id: "writing",
      label: label("Writing", "Бичих"),
      minutes: 23,
      sampleMinutes: 7,
    },
    {
      id: "speaking",
      label: label("Speaking", "Ярих"),
      minutes: 8,
      sampleMinutes: 4,
    },
  ],
};
export const variants = {};
for (const [exam, modes] of Object.entries(practiceModes)) {
  for (const set of ["sample", 1, 2, 3, 4, 5]) {
    const sample = set === "sample";
    const base = tests[`${exam}-${sample ? 1 : set}`];
    const extra = additions[`${exam}-${sample ? 1 : set}`] ?? {};
    const parts = modes.map((mode) => {
      let questions;
      if (exam === "sat") {
        questions = (sample ? tests["sat-sample"] : base).questions.filter(
          (q) => q.section === mode.label.en,
        );
      } else if (mode.id === "reading") {
        questions = sample
          ? tests[`${exam}-sample`].questions
          : [...(extra.reading ?? []), ...base.questions];
      } else {
        questions = extra[mode.id];
        if (sample)
          questions =
            mode.id === "listening"
              ? questions.slice(0, 3)
              : [
                  questions.find(
                    (q) => q.kind === "essay" || q.kind === "speaking",
                  ),
                ];
      }
      const number = `${mode.id}-${set}`;
      const minutes = sample ? mode.sampleMinutes : mode.minutes;
      // Stable namespaced IDs keep section answers separate inside a full attempt.
      questions = questions.map((q, i) => ({ ...q, id: `${mode.id}-${i}` }));
      const part = {
        exam,
        number,
        set,
        mode: mode.id,
        isSample: sample,
        minutes,
        questions,
        source: base.source,
        outline: [
          {
            id: mode.id,
            label: mode.label,
            minutes,
            count: questions.length,
            questionIds: questions.map((q) => q.id),
          },
        ],
      };
      variants[`${exam}-${number}`] = part;
      return part;
    });
    variants[`${exam}-full-${set}`] = {
      exam,
      number: `full-${set}`,
      set,
      mode: "full",
      isSample: sample,
      minutes: parts.reduce((sum, p) => sum + p.minutes, 0),
      questions: parts.flatMap((p) => p.questions),
      outline: parts.flatMap((p) => p.outline),
      source: base.source,
    };
  }
  modes.push({ id: "full", label: label("Full test", "Бүтэн сорил") });
}
export function isSample(test) {
  return test.isSample ?? test.number === "sample";
}
export function testSummary(test) {
  return {
    exam: test.exam,
    number: test.number,
    set: test.set ?? test.number,
    mode: test.mode,
    minutes: test.minutes,
    count: test.questions.length,
    sections: [...new Set(test.questions.map((q) => q.section))],
    outline: test.outline,
    transcriptPractice: test.questions.some((q) => q.section === "Listening"),
    selfReview: test.questions.some(
      (q) => q.kind === "essay" || q.kind === "speaking",
    ),
  };
}
export function publicTest(test) {
  return {
    ...test,
    questions: test.questions.map(
      ({ answer, accepted, explanation, ...q }) => ({
        ...q,
        answerForm: answerForm({ ...q, answer, accepted }),
      }),
    ),
  };
}
const normalize = (v) =>
  String(v ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[−–]/g, "-")
    .replace(/\s/g, "")
    .trim();
const NUMBER_WORDS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  thirtieth: 30,
};
const TENS = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
export function numericValue(raw) {
  let text = String(raw ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[£$,]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
  text = text.replace(/(\d+)\s*(st|nd|rd|th)$/, "$1");
  if (/^-?\d+(\.\d+)?$/.test(text)) return String(Number(text));
  const word = text.replace(/-/g, " ");
  if (NUMBER_WORDS[word] != null) return String(NUMBER_WORDS[word]);
  const parts = word.split(" ");
  if (
    parts.length === 2 &&
    TENS[parts[0]] != null &&
    NUMBER_WORDS[parts[1]] != null &&
    NUMBER_WORDS[parts[1]] < 10
  )
    return String(TENS[parts[0]] + NUMBER_WORDS[parts[1]]);
  return null;
}
export function timeValue(raw) {
  const spaced = String(raw ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const compact = spaced.replace(/\s/g, "");
  const clock = compact.match(/^(\d{1,2})[:.](\d{2})$/);
  if (clock && Number(clock[2]) < 60)
    return `${Number(clock[1])}:${clock[2]}`;
  const hour = (word) => NUMBER_WORDS[word];
  const half = spaced.match(/^half past (\w+)$/);
  if (half && hour(half[1]) != null) return `${hour(half[1])}:30`;
  const quarter = spaced.match(/^quarter past (\w+)$/);
  if (quarter && hour(quarter[1]) != null) return `${hour(quarter[1])}:15`;
  const to = spaced.match(/^quarter to (\w+)$/);
  if (to && hour(to[1]) != null) {
    const h = hour(to[1]);
    return `${h === 1 ? 12 : h - 1}:45`;
  }
  return null;
}
function looseText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, "")
    .trim();
}
function sameLoose(left, right) {
  const a = looseText(left);
  const b = looseText(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length > 3 && (a + "s" === b || b + "s" === a)) return true;
  if (a.length > 4 && (a + "es" === b || b + "es" === a)) return true;
  return false;
}
export function answerForm(question) {
  if (
    question.options ||
    question.kind === "essay" ||
    question.kind === "speaking"
  )
    return "";
  const primary = Array.isArray(question.answer)
    ? question.answer[0]
    : question.answer;
  if (timeValue(primary)) return "time";
  if (numericValue(primary) != null) return "number";
  return "";
}
const IELTS_LISTENING = [
  [39, 40, 9],
  [37, 38, 8.5],
  [35, 36, 8],
  [32, 34, 7.5],
  [30, 31, 7],
  [26, 29, 6.5],
  [23, 25, 6],
  [18, 22, 5.5],
  [16, 17, 5],
  [13, 15, 4.5],
  [10, 12, 4],
  [6, 9, 3.5],
  [4, 5, 3],
  [0, 3, 2.5],
];
const IELTS_READING = [
  [39, 40, 9],
  [37, 38, 8.5],
  [35, 36, 8],
  [33, 34, 7.5],
  [30, 32, 7],
  [27, 29, 6.5],
  [23, 26, 6],
  [19, 22, 5.5],
  [15, 18, 5],
  [13, 14, 4.5],
  [10, 12, 4],
  [8, 9, 3.5],
  [6, 7, 3],
  [0, 5, 2.5],
];
const TOEFL_READING = [
  [48, 50, 6],
  [44, 47, 5.5],
  [40, 43, 5],
  [35, 39, 4.5],
  [30, 34, 4],
  [25, 29, 3.5],
  [20, 24, 3],
  [15, 19, 2.5],
  [10, 14, 2],
  [5, 9, 1.5],
  [0, 4, 1],
];
const TOEFL_LISTENING = [
  [45, 47, 6],
  [42, 44, 5.5],
  [38, 41, 5],
  [33, 37, 4.5],
  [29, 32, 4],
  [24, 28, 3.5],
  [19, 23, 3],
  [15, 18, 2.5],
  [10, 14, 2],
  [5, 9, 1.5],
  [0, 4, 1],
];
function bandFrom(raw, table) {
  return table.find(([min, max]) => raw >= min && raw <= max)?.[2] ?? null;
}
function roundBand(avg) {
  const quarters = Math.round(avg * 4) / 4;
  const fraction = Math.round((quarters - Math.floor(quarters)) * 100);
  if (fraction === 25) return Math.floor(quarters) + 0.5;
  if (fraction === 75) return Math.ceil(quarters);
  return quarters;
}
export function officialScore(exam, sections) {
  const parts = [];
  for (const section of sections) {
    if (!section.total) continue;
    let band = null;
    if (
      exam === "ielts" &&
      section.section === "Listening" &&
      section.total >= 40
    )
      band = bandFrom(section.score, IELTS_LISTENING);
    if (exam === "ielts" && section.section === "Reading" && section.total >= 40)
      band = bandFrom(section.score, IELTS_READING);
    if (
      exam === "toefl" &&
      section.section === "Reading" &&
      section.total >= 50
    )
      band = bandFrom(section.score, TOEFL_READING);
    if (
      exam === "toefl" &&
      section.section === "Listening" &&
      section.total >= 47
    )
      band = bandFrom(section.score, TOEFL_LISTENING);
    if (band != null)
      parts.push({
        section: section.section,
        score: section.score,
        total: section.total,
        band,
      });
  }
  if (!parts.length) return null;
  return {
    band: roundBand(parts.reduce((sum, part) => sum + part.band, 0) / parts.length),
    bandParts: parts,
  };
}
export function grade(test, answers) {
  const results = test.questions.map((q) => {
    const supplied = answers[q.id] ?? "";
    if (q.kind === "essay" || q.kind === "speaking")
      return { ...q, supplied, correct: null };
    const accepted =
      q.accepted ?? (Array.isArray(q.answer) ? q.answer : [q.answer]);
    const correct = q.options
      ? accepted.some((a) => String(a) === String(supplied))
      : normalize(supplied) !== "" &&
        accepted.some((a) => {
          if (
            q.kind === "sentence" &&
            normalize(a).replace(/[.!?]+$/, "") ===
              normalize(supplied).replace(/[.!?]+$/, "")
          )
            return true;
          if (normalize(a) === normalize(supplied)) return true;
          if (timeValue(supplied) && timeValue(supplied) === timeValue(a))
            return true;
          const suppliedNumber = numericValue(supplied);
          if (
            timeValue(supplied) == null &&
            timeValue(a) == null &&
            suppliedNumber != null &&
            numericValue(a) === suppliedNumber
          )
            return true;
          return sameLoose(supplied, a);
        });
    const words = {
      sponges: "хөвөн",
      sediments: "тунадас",
      ditches: "шуудуу",
      privately: "хувийн",
      layout: "байрлал",
      tactile: "хүрэлцэх мэдрэмжийн",
      thousands: "мянга мянган",
      visual: "харааны",
      memories: "дурсамж",
      tissue: "эд",
      restoration: "нөхөн сэргээлт",
      debt: "өр",
      costs: "зардал",
      footfall: "явган хүний урсгал",
      hours: "цаг",
      loyalty: "үнэнч байдал",
      fragments: "хэлтэрхий",
      speed: "хурд",
      chain: "гинжин",
      orbit: "тойрог зам",
      premium: "нэмэлт үйлчилгээтэй гишүүнчлэл",
      Tuesday: "Мягмар",
      Wednesday: "Лхагва",
      Saturday: "Бямба",
      Sunday: "Ням",
      broad: "өргөн хүрээтэй",
      "open-data": "нээлттэй мэдээллийн",
      survey: "санал асуулга",
      third: "гуравны нэг",
      cheap: "хямд",
      battery: "батарей",
      infrastructure: "дэд бүтэц",
      pets: "тэжээвэр амьтад",
      first: "эхний",
      second: "хоёрдугаар",
      flash: "гэрэл цацруулагч",
      locker: "цоожтой шкаф",
      coins: "зоос",
      blue: "цэнхэр",
      melatonin: "мелатонин",
      themselves: "өөрсдөө",
      photography: "гэрэл зураг",
      camera: "камер",
      half: "тал",
      flexible: "уян хатан",
      "cash flow": "мөнгөн гүйлгээ",
      relief: "хөнгөлөлт",
      trees: "мод",
      noon: "үд дунд",
      water: "ус",
      north: "хойд",
      satellites: "хиймэл дагуулууд",
      prevention: "урьдчилан сэргийлэлт",
      magma: "магма",
      surface: "гадарга",
      release: "ялгаруулах",
      materials: "материалууд",
      mountain: "уул",
      evaporate: "уурших",
      cools: "хөрдөг",
      precipitation: "хур тунадас",
      ocean: "далай",
      melts: "хайлдаг",
      solid: "хатуу",
      downhill: "уруудаж",
      shrinking: "багасаж буй",
      sunlight: "нарны гэрэл",
      roots: "үндэс",
      nearly: "бараг",
      blades: "сэнсний далавч",
      electricity: "цахилгаан",
      produce: "үйлдвэрлэх",
      strongly: "хүчтэй",
    };
    const {
      passage,
      passageMn,
      audio,
      speechText,
      table,
      tableMn,
      ...review
    } = q;
    return {
      ...review,
      supplied,
      correct,
      answerMn:
        typeof q.answer === "string" ? words[q.answer] || q.answer : undefined,
    };
  });
  const sectionResults = [...new Set(results.map((q) => q.section))].map(
    (section) => {
      const items = results.filter((q) => q.section === section);
      return {
        section,
        score: items.filter((q) => q.correct).length,
        total: items.filter((q) => q.correct !== null).length,
        selfReviewCount: items.filter((q) => q.correct === null).length,
      };
    },
  );
  return {
    score: results.filter((q) => q.correct).length,
    total: results.filter((q) => q.correct !== null).length,
    selfReviewCount: results.filter((q) => q.correct === null).length,
    questionCount: results.length,
    sectionResults,
    results,
    ...(officialScore(test.exam, sectionResults) ?? {}),
  };
}
