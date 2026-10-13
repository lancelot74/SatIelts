const pair = (en, mn) => ({ en, mn });
export const exams = [
  {
    id: "ielts",
    name: "IELTS",
    edition: "Academic",
    count: 6,
    guide: "IELTS_Study_Guide_MN.pdf",
    guidePages: 22,
    sampleMinutes: 10,
    tagline: pair(
      "Find your voice. Open your world.",
      "Дэлхийд хүрэх өөрийн дуу хоолой.",
    ),
    description: pair(
      "Build confidence in reading, listening, writing and speaking. One thoughtful practice session at a time.",
      "Унших, сонсох, бичих, ярих чадвараа алхам алхмаар хөгжүүл. Өдөр бүрийн дадлагаас итгэл төрнө.",
    ),
    skills: ["Reading", "Listening", "Writing", "Speaking"],
    topics: [
      "Environment & wetlands",
      "Technology & reading",
      "Health & sleep",
      "Business & economics",
      "Space & community",
      "Complete practice test",
    ],
    lessons: [
      pair("Understand the exam", "Шалгалтаа ойлгох"),
      pair("Make a study plan", "Судлах төлөвлөгөө"),
      pair("Reading & listening strategies", "Унших ба сонсох стратеги"),
      pair("Writing & speaking with confidence", "Бичих ба ярих чадвар"),
    ],
    lessonPages: [3, 8, 10, 14],
  },
  {
    id: "toefl",
    name: "TOEFL",
    edition: "iBT · 2026",
    count: 6,
    guide: "TOEFL_2026_Study_Guide_MN.pdf",
    guidePages: 38,
    sampleMinutes: 8,
    tagline: pair(
      "Your next chapter starts here.",
      "Дараагийн алхам эндээс эхэлнэ.",
    ),
    description: pair(
      "Get comfortable with academic English and the updated 2026 task types, with clear explanations along the way.",
      "Академик англи хэл болон 2026 оны шинэ даалгаврын төрлүүдтэй танилц. Ойлгомжтой тайлбартайгаар дадлага хий.",
    ),
    skills: ["Reading", "Listening", "Writing", "Speaking"],
    topics: [
      "Nature & everyday life",
      "History & the natural world",
      "Science & university life",
      "Learning & memory",
      "Academic practice",
      "Complete practice test",
    ],
    lessons: [
      pair("The 2026 format", "2026 оны шинэ бүтэц"),
      pair("Reading task types", "Унших даалгаврын төрлүүд"),
      pair("Listening strategies", "Сонсох стратеги"),
      pair("Writing & speaking practice", "Бичих ба ярих дадлага"),
    ],
    lessonPages: [6, 10, 15, 20],
  },
  {
    id: "sat",
    name: "SAT",
    edition: "Digital SAT",
    count: 5,
    guide: "SAT_Study_Guide_MN.pdf",
    guidePages: 15,
    sampleMinutes: 8,
    tagline: pair("Think clearly. Go further.", "Тодорхой бод. Цааш тэмүүл."),
    description: pair(
      "A little language, a little logic. Strengthen your reading, writing and math with focused, approachable practice.",
      "Хэл, логик, тооцоолол. Унших, бичих, математикийн чадвараа ойлгомжтой, төвлөрсөн дасгалаар хөгжүүл.",
    ),
    skills: ["Reading & Writing", "Math"],
    topics: [
      "Grammar, algebra & foundations",
      "Words, functions & equations",
      "Reading, ratios & geometry",
      "Language, graphs & problem solving",
      "Mixed practice & review",
    ],
    lessons: [
      pair("Meet the Digital SAT", "Digital SAT-тай танилцах"),
      pair("Reading & Writing essentials", "Унших ба бичих суурь"),
      pair("Math foundations", "Математикийн суурь"),
      pair("Strategy & your study plan", "Стратеги ба төлөвлөгөө"),
    ],
    lessonPages: [3, 5, 8, 12],
  },
];
export const examById = (id) => exams.find((exam) => exam.id === id);
const q = (prompt, choices, answer, en, mn, extra = {}) => ({
  prompt,
  choices,
  answer,
  explanation: pair(en, mn),
  ...extra,
});
const wetlands = [
  "For much of the twentieth century, wetlands were regarded as wasteland. Marshes and bogs were drained on a vast scale to create farmland, control mosquitoes or make room for expanding towns. It is estimated that more than half of the world’s wetlands disappeared during this period. Attitudes shifted only in recent decades, once scientists began to measure how much these waterlogged landscapes actually do for us.",
  "Wetlands function as natural infrastructure. They act as sponges, absorbing heavy rainfall and releasing it slowly, which reduces the severity of floods downstream. They filter pollutants from water, trapping sediments and breaking down contaminants before they reach rivers and reservoirs. Peat-forming wetlands also store large quantities of carbon, more per hectare than forests, which makes their protection valuable in limiting climate change.",
  "Recognising this, governments and conservation groups have increasingly turned to wetland restoration. The approach varies. In some cases it is as simple as blocking the drainage ditches that once dried the land, allowing water to return naturally. In others, it involves reintroducing native plants or even reshaping the terrain. Restored wetlands can recover surprisingly quickly, with birds, amphibians and insects returning within a few seasons.",
  "Restoration is not without difficulties, however. Land that has been farmed for generations is often privately owned, and persuading owners to give it up can be costly and slow. There is also debate over how to measure success: a site may look healthy yet fail to deliver the carbon storage or biodiversity that was hoped for. Critics caution against treating restoration as a simple offset that licenses continued destruction elsewhere.",
  "Despite these reservations, momentum is growing. Several countries have set targets to restore wetlands over the coming decade, and early results are encouraging. Land once dismissed as useless swamp is now treated as a resource worth protecting.",
];
const beePassage =
  "Honeybees communicate the location of food through a behavior called the “waggle dance.” When a foraging bee returns to the hive after finding flowers, it performs a series of movements on the honeycomb. The angle of the dance relative to vertical indicates the direction of the food in relation to the sun, while the duration of the “waggle” phase signals the distance. Remarkably, other bees can decode this information in the dark hive and fly directly to the source. This discovery, made by the scientist Karl von Frisch in the twentieth century, showed that insects are capable of a form of symbolic communication once thought unique to humans. However, the dance is not perfectly precise; bees that follow it still rely on scent to pinpoint the exact flowers.";
export const samples = {
  ielts: {
    title: "Bringing Back the Wetlands",
    section: "Reading",
    source: "IELTS_Mock_Tests_MN.pdf · pp. 5–6, 33",
    passage: wetlands,
    questions: [
      q(
        "Over half of the world’s wetlands were lost during the twentieth century.",
        ["True", "False", "Not Given"],
        "True",
        "The first paragraph says “more than half” disappeared during this period.",
        "Эхний догол мөрөнд “more than half” буюу талаас илүү нь устсан гэжээ.",
      ),
      q(
        "Wetlands store less carbon per hectare than forests.",
        ["True", "False", "Not Given"],
        "False",
        "The passage states “more per hectare than forests”, the opposite of the statement.",
        "Эхэд ойгоос “more per hectare” буюу нэг га-д илүү нүүрстөрөгч хадгалдаг гэсэн байна.",
      ),
      q(
        "Restored wetlands can be recolonised by wildlife within a few seasons.",
        ["True", "False", "Not Given"],
        "True",
        "Birds, amphibians and insects return “within a few seasons”.",
        "Шувуу, хоёр нутагтан, шавьж хэдхэн улирлын дотор эргэн ирдэг гэж шууд дурдсан.",
      ),
      q(
        "Most wetland restoration projects are funded by private companies.",
        ["True", "False", "Not Given"],
        "Not Given",
        "Governments and conservation groups are mentioned, but no majority funding source is stated.",
        "Засгийн газар, байгаль хамгаалах бүлгийг дурдсан ч санхүүжилтийн дийлэнхийг хэн гаргадаг нь байхгүй.",
      ),
      q(
        "Some critics fear restoration could be used to justify destruction elsewhere.",
        ["True", "False", "Not Given"],
        "True",
        "Critics caution against restoration becoming an offset that “licenses continued destruction elsewhere”.",
        "Сэргээн засварлалтыг өөр газар устгал хийхийг зөвтгөх шалтаг болгож болохгүйг шүүмжлэгчид анхааруулсан.",
      ),
      q(
        "Wetlands behave like ____________, storing rainfall and releasing it slowly.",
        null,
        "sponges",
        "The second paragraph says “They act as sponges”. Use one word from the passage.",
        "Хоёр дахь догол мөрөнд “They act as sponges” гэжээ. Эхээс нэг үгээр нөхнө.",
        {
          hint: pair(
            "Write ONE word from the passage.",
            "Эхээс НЭГ үг бичнэ үү.",
          ),
        },
      ),
    ],
  },
  toefl: {
    title: "The language of honeybees",
    section: "Reading",
    source: "TOEFL_2026_5_Mock_Tests_MN.pdf · pp. 6–7, 12",
    passage: [beePassage],
    questions: [
      q(
        "What is the passage mainly about?",
        [
          "How bees produce honey",
          "How bees communicate the location of food",
          "Why bees are dying out",
          "How Karl von Frisch trained bees",
        ],
        "How bees communicate the location of food",
        "The passage explains how the waggle dance communicates the location of food.",
        "Бичвэр бүхэлдээ зөгий бүжгээрээ хоол хаана байгааг дамжуулах тухай.",
      ),
      q(
        "What does the angle of the dance indicate?",
        [
          "The distance to the food",
          "The type of flower",
          "The direction of the food relative to the sun",
          "The number of bees needed",
        ],
        "The direction of the food relative to the sun",
        "The angle indicates direction relative to the sun; duration indicates distance.",
        "Өнцөг нь нартай харьцуулсан чиглэлийг, үргэлжлэх хугацаа нь зайг заадаг.",
      ),
      q(
        "The word “decode” is closest in meaning to:",
        ["interpret", "ignore", "repeat", "record"],
        "interpret",
        "To decode information is to interpret or understand its meaning.",
        "“Decode” нь тайлах, ойлгох гэсэн утгатай. Иймээс “interpret” зөв.",
      ),
      q(
        "According to the passage, why is the dance NOT perfectly precise?",
        [
          "Bees dance too fast",
          "The hive is too dark",
          "Bees still need scent to find the exact flowers",
          "The sun moves during the day",
        ],
        "Bees still need scent to find the exact flowers",
        "The final sentence says bees still rely on scent to pinpoint the exact flowers.",
        "Сүүлийн өгүүлбэрт яг тэр цэцгийг олохын тулд үнэрт тулгуурладаг гэжээ.",
      ),
      q(
        "What can be inferred about von Frisch’s discovery?",
        [
          "It proved bees are smarter than humans",
          "It changed ideas about animal communication",
          "It was quickly forgotten",
          "It applied only to one hive",
        ],
        "It changed ideas about animal communication",
        "Symbolic communication had been thought unique to humans; the discovery challenged that idea.",
        "Зөвхөн хүнд байдаг гэж үзсэн бэлгэдлийн харилцаа шавьжид ч байдгийг харуулсан.",
      ),
    ],
  },
  sat: {
    title: "A little language. A little logic.",
    section: "Reading & Writing + Math",
    source: "SAT_Mock_Tests_MN.pdf · pp. 3, 5, 7",
    passage: null,
    questions: [
      q(
        "The scientist, along with her assistants, ______ preparing to publish the findings next month.",
        ["are", "were", "is", "have been"],
        "is",
        "The subject “The scientist” is singular. “Along with her assistants” does not change the subject’s number.",
        "Эзэн бие “The scientist” ганц тоо. “Along with her assistants” нь тоог өөрчлөхгүй.",
        { skill: "Reading & Writing" },
      ),
      q(
        "The ancient manuscript was so ______ that scholars could barely decipher a single line.",
        ["legible", "illegible", "concise", "vivid"],
        "illegible",
        "“Could barely decipher” means it was difficult to read. “Illegible” means unreadable.",
        "“Could barely decipher” нь уншихад бэрх гэсэн утгатай. “Illegible” — уншигдахгүй.",
        { skill: "Reading & Writing" },
      ),
      q(
        "The novelist’s early works, ______ received little attention, are now regarded as masterpieces.",
        ["who", "which", "whom", "where"],
        "which",
        "“Which” refers to things: the novelist’s works. “Who” and “whom” refer to people.",
        "“Works” буюу бүтээлүүдийг тодотгож байгаа тул “which” зөв. “Who/whom” хүнд хэрэглэнэ.",
        { skill: "Reading & Writing" },
      ),
      q(
        "If 5x + 3 = 28, what is x?",
        ["4", "5", "6", "7"],
        "5",
        "Subtract 3 from each side: 5x = 25. Divide by 5: x = 5.",
        "Хоёр талаас 3-ыг хасна: 5x = 25. 5-д хуваана: x = 5.",
        { skill: "Math" },
      ),
      q(
        "A line has slope 3 and passes through (0, −2). What is y when x = 4?",
        null,
        "10",
        "The line is y = 3x − 2. Substitute x = 4: y = 12 − 2 = 10.",
        "Шулууны тэгшитгэл y = 3x − 2. x = 4 үед y = 12 − 2 = 10.",
        {
          skill: "Math",
          numeric: true,
          hint: pair("Enter a number.", "Тоогоор хариулна уу."),
        },
      ),
      q(
        "What is 40% of 250?",
        ["80", "100", "120", "150"],
        "100",
        "Convert 40% to 0.40 and multiply: 0.40 × 250 = 100.",
        "40% = 0.40. Тэгвэл 0.40 × 250 = 100.",
        { skill: "Math" },
      ),
    ],
  },
};
export function publicSample(id) {
  const data = samples[id];
  return (
    data && {
      ...data,
      minutes: examById(id).sampleMinutes,
      questions: data.questions.map(({ answer, explanation, ...rest }, i) => ({
        ...rest,
        id: i,
      })),
    }
  );
}
export function gradeSample(id, answers) {
  const sample = samples[id];
  const results = sample.questions.map((question, i) => {
    const supplied = String(answers[i] ?? "").trim();
    const correct = question.numeric
      ? supplied !== "" && Number(supplied) === Number(question.answer)
      : supplied.toLocaleLowerCase("en-US") ===
        question.answer.toLocaleLowerCase("en-US");
    return {
      id: i,
      prompt: question.prompt,
      supplied,
      answer: question.answer,
      explanation: question.explanation,
      correct,
    };
  });
  return {
    score: results.filter((q) => q.correct).length,
    total: results.length,
    results,
  };
}
