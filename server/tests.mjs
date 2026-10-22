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
        expectsNumber: expectsNumber({ ...q, answer, accepted }),
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
const expectsNumber = (question) => {
  if (
    question.options ||
    question.kind === "essay" ||
    question.kind === "speaking"
  )
    return false;
  const primary = Array.isArray(question.answer)
    ? question.answer[0]
    : question.answer;
  return numericValue(primary) != null;
};
export function grade(test, answers) {
  const results = test.questions.map((q) => {
    const supplied = answers[q.id] ?? "";
    if (q.kind === "essay" || q.kind === "speaking")
      return { ...q, supplied, correct: null };
    const accepted =
      q.accepted ?? (Array.isArray(q.answer) ? q.answer : [q.answer]);
    const suppliedNumber = numericValue(supplied);
    const correct = q.options
      ? accepted.some((a) => String(a) === String(supplied))
      : normalize(supplied) !== "" &&
        accepted.some(
          (a) =>
            (q.kind === "sentence"
              ? normalize(a).replace(/[.!?]+$/, "") ===
                normalize(supplied).replace(/[.!?]+$/, "")
              : normalize(a) === normalize(supplied)) ||
            (suppliedNumber != null && numericValue(a) === suppliedNumber) ||
            (Number.isFinite(Number(a)) &&
              Number.isFinite(Number(supplied)) &&
              Number(a) === Number(supplied)),
        );
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
  return {
    score: results.filter((q) => q.correct).length,
    total: results.filter((q) => q.correct !== null).length,
    selfReviewCount: results.filter((q) => q.correct === null).length,
    questionCount: results.length,
    sectionResults: [...new Set(results.map((q) => q.section))].map(
      (section) => {
        const items = results.filter((q) => q.section === section);
        return {
          section,
          score: items.filter((q) => q.correct).length,
          total: items.filter((q) => q.correct !== null).length,
          selfReviewCount: items.filter((q) => q.correct === null).length,
        };
      },
    ),
    results,
  };
}
