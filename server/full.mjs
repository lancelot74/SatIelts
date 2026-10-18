import fs from "node:fs";

const books = JSON.parse(
  fs.readFileSync(new URL("../content/full-length.json", import.meta.url), "utf8"),
);
const label = (en, mn) => ({ en, mn });
const modeLabel = {
  rw1: label("Reading & Writing 1", "Унших ба бичих 1"),
  rw2: label("Reading & Writing 2", "Унших ба бичих 2"),
  math1: label("Math 1", "Математик 1"),
  math2: label("Math 2", "Математик 2"),
  listening: label("Listening", "Сонсох"),
  reading: label("Reading", "Унших"),
  writing: label("Writing", "Бичих"),
  speaking: label("Speaking", "Ярих"),
  length: label("Full test", "Бүтэн сорил"),
};

export const fullVariants = {};
export const fullModeIds = { sat: [], ielts: [], toefl: [] };

for (const book of books) {
  const parts = book.sections.map((section) => {
    const questions = section.questions.map((question, index) => ({
      ...question,
      id: `${section.id}-${index}`,
    }));
    const part = {
      exam: book.exam,
      number: `length-${section.id}-${book.number}`,
      set: book.number,
      mode: section.id,
      isSample: false,
      minutes: section.minutes,
      questions,
      source: `Full-length practice test ${book.number}`,
      outline: [
        {
          id: section.id,
          label: modeLabel[section.id],
          minutes: section.minutes,
          count: questions.length,
          questionIds: questions.map((question) => question.id),
        },
      ],
    };
    fullVariants[`${book.exam}-${part.number}`] = part;
    return part;
  });
  if (!fullModeIds[book.exam].length)
    fullModeIds[book.exam] = [
      ...book.sections.map((section) => section.id),
      "length",
    ];
  fullVariants[`${book.exam}-length-${book.number}`] = {
    exam: book.exam,
    number: `length-${book.number}`,
    set: book.number,
    mode: "length",
    isSample: false,
    minutes: parts.reduce((sum, part) => sum + part.minutes, 0),
    questions: parts.flatMap((part) => part.questions),
    outline: parts.flatMap((part) => part.outline),
    source: `Full-length practice test ${book.number}`,
  };
}

export function fullModes(exam) {
  return fullModeIds[exam].map((id) => ({ id, label: modeLabel[id] }));
}
