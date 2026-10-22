"""Turn the downloaded full-length practice zips into scored website tests."""
import json, re, shutil, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = Path.home() / "Downloads"
MEDIA = ROOT / "public" / "media"
OUT = ROOT / "content" / "full-length.json"
NOTE = "Энэ шинэ сорилын асуулт англи хэл дээр."

ZIPS = {
    "sat": [DOWNLOADS / "SAT_Practice_Tests_01-10.zip"],
    "ielts": [
        DOWNLOADS / "IELTS_Part1_of_4_Tests01-03.zip",
        DOWNLOADS / "IELTS_Part2_of_4_Tests04-06.zip",
        DOWNLOADS / "IELTS_Part3_of_4_Tests07-09.zip",
        DOWNLOADS / "IELTS_Part4_of_4_Tests10-10.zip",
    ],
    "toefl": [
        DOWNLOADS / "TOEFL_Part1_of_5_Tests01-02.zip",
        DOWNLOADS / "TOEFL_Part2_of_5_Tests03-04.zip",
        DOWNLOADS / "TOEFL_Part3_of_5_Tests05-06.zip",
        DOWNLOADS / "TOEFL_Part4_of_5_Tests07-08.zip",
        DOWNLOADS / "TOEFL_Part5_of_5_Tests09-10.zip",
    ],
}


def text_of(pdf):
    import subprocess
    raw = subprocess.check_output(["pdftotext", "-layout", str(pdf), "-"], text=True)
    lines = []
    for line in raw.splitlines():
        if "Original practice material" in line:
            continue
        if re.search(r"Practice Test \d+ - (Student Test Booklet|Answer Key)", line):
            continue
        if re.fullmatch(r"\s*Page \d+\s*", line):
            continue
        lines.append(line.rstrip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines))


def clean(value):
    return re.sub(r"\s+", " ", value).strip()


def pair(en, mn=None):
    return {"en": en, "mn": mn or NOTE}


def letter_index(value):
    if re.fullmatch(r"[A-H]", value or ""):
        return ord(value) - 65
    return None


def parse_answers(key_text):
    """Return {section title: {number: {answer, accepted, explanation}}}."""
    parts = re.split(
        r"(?m)^[ \t]*(Reading and Writing - Module [12]|Math - Module [12]|Reading - Module [12]|Listening - Module [12]|LISTENING|READING|WRITING|SPEAKING|Build a Sentence|Write an Email|Write for an Academic Discussion|Listen and Repeat|Take an Interview)(?: \([^)\n]+\))?[ \t]*$",
        key_text,
    )
    sections = {}
    for i in range(1, len(parts), 2):
        title, body = parts[i], parts[i + 1]
        pieces = re.split(r"(?m)^[ \t]*#[ \t]+", body, maxsplit=1)
        grid, rest = (pieces[0], "") if len(pieces) == 1 else pieces
        answers = {}
        for number, answer in re.findall(r"(\d+)\s*:\s*([A-Za-z0-9./%+\-−]+)", grid):
            answers[int(number)] = {
                "answer": answer.replace("−", "-").replace("–", "-"),
                "accepted": [],
                "explanation": "",
            }
        current = None
        buf = []
        for line in rest.splitlines():
            match = re.match(r"\s*(\d+)\s{2,}(\S.*)$", line)
            if match and int(match.group(1)) <= 60:
                if current is not None:
                    store_explanation(answers, current, " ".join(buf))
                current = int(match.group(1))
                buf = [match.group(2)]
            elif current is not None and line.strip():
                buf.append(line.strip())
        if current is not None:
            store_explanation(answers, current, " ".join(buf))
        for number, answer in re.findall(
            r"(?<!\d)(\d{1,2}):\s*([A-H]|[0-9][0-9./:%+\-−]{0,12})",
            rest,
        ):
            slot = answers.setdefault(
                int(number),
                {"answer": "", "accepted": [], "explanation": ""},
            )
            if not slot["answer"]:
                slot["answer"] = answer.replace("−", "-").replace("–", "-")
        if answers:
            sections[title] = answers
    return sections


def short_forms(text):
    forms = []
    for piece in re.split(r"[;,/]|\bor\b", text):
        piece = clean(re.sub(r"\(.*?\)", "", piece)).strip(" .")
        if piece and len(piece) <= 40 and len(piece.split()) <= 6:
            forms.append(piece)
    return forms


def store_explanation(answers, number, raw):
    item = answers.setdefault(number, {"answer": "", "accepted": [], "explanation": ""})
    word = re.search(r"Complete word:\s*([A-Za-z][A-Za-z'’-]*)", raw)
    also = re.search(r"\(also accept:\s*([^)]{0,160})", raw, re.S)
    explanation = re.split(r"\[(?:Craft|Information|Expression|Standard|Algebra|Advanced|Problem|Geometry)", raw)[0]
    explanation = re.sub(r"\(also accept:.*", "", explanation, flags=re.S)
    if not item["answer"]:
        first = clean(raw).split()
        if first:
            token = first[0].strip(".,;:'\"")
            if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9'’./:-]{0,30}", token):
                item["answer"] = token
    extra_accept = re.search(r"also\s+accept:\s*([^.)]+)", raw, re.I)
    if extra_accept:
        item["accepted"] = short_forms(item["answer"] + ", " + extra_accept.group(1))
    if word:
        item["answer"] = word.group(1)
        item["accepted"] = [word.group(1)]
    elif also and not extra_accept:
        item["accepted"] = short_forms(also.group(1))
        if item["answer"] and item["answer"] not in item["accepted"]:
            item["accepted"].insert(0, item["answer"])
    item["explanation"] = clean(explanation)[:500]


def group_directions(text):
    ranges = []
    pattern = re.compile(
        r"Questions\s+(\d+)\s*[-–—]\s*(\d+)\s*:\s*(.+?)(?=\n\s*(?:Questions\s+\d+\s*[-–—]|PART\s+\d+|\d+\.)|\Z)",
        re.I | re.S,
    )
    for match in pattern.finditer(text):
        start, end = int(match.group(1)), int(match.group(2))
        direction = clean(match.group(3))
        kept = re.match(
            r"(.+?(?:for each answer\.|A, B(?:, C)? or [A-Z]\.|NO MORE THAN [^.]+|ONE WORD[^.]*\.|in the passage\.))",
            direction,
            re.I,
        )
        direction = clean(kept.group(1) if kept else direction[:180])
        if direction:
            ranges.append((start, end, f"Questions {start}–{end}: {direction}"))
    return ranges


def questions_in(text):
    directions = group_directions(text)
    matches = []
    last = 0
    for match in re.finditer(r"(?m)^[ \t]*(\d+)\.[ \t]*", text):
        number = int(match.group(1))
        if number > 60 or not (last == 0 or number == last + 1):
            continue
        matches.append(match)
        last = number
    items = []
    for index, match in enumerate(matches):
        start = matches[index - 1].end() if index else 0
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        stem = text[start:match.start()]
        body = text[match.end():end]
        stem = re.sub(r"(?is)DIRECTIONS.*?(?=The |Although |In |A |An |\Z)", "", stem)
        stem = re.sub(r"(?m)^[ \t]*(Reference|Shape / fact|Circle|Rectangle|Triangle|Pythagorean|Special right|Rectangular|Right circular|Sphere|Pyramid|Angles).*$", "", stem)
        audio = re.search(r"\[Audio:\s*([^\]]+)\]", stem + body)
        body = re.sub(r"\[Audio:[^\]]+\]", "", body)
        stem = re.sub(r"\[Audio:[^\]]+\]", "", stem)
        option_matches = list(re.finditer(r"(?m)^[ \t]*([A-H])\)\s+", body))
        options = None
        prompt_body = body
        if option_matches:
            options = []
            for i, opt in enumerate(option_matches):
                stop = option_matches[i + 1].start() if i + 1 < len(option_matches) else len(body)
                options.append(clean(body[opt.end():stop]))
            prompt_body = body[:option_matches[0].start()]
        stem_text = clean(stem)
        own = clean(prompt_body)
        use_stem = (
            stem_text
            and "____" not in stem_text
            and "Questions" not in stem_text
            and not stem_text.startswith("PART")
            and len(stem_text) > 40
        )
        prompt = clean(f"{stem_text + ' ' if use_stem else ''}{own}")
        prompt = re.sub(r"\(Questions\s+\d+\s*[-–—]\s*\d+\)", "", prompt)
        prompt = re.sub(r"Questions\s+\d+\s*[-–—]\s*\d+\s*:\s*", "", prompt)
        prompt = re.sub(r"\bPART\s+\d+\b", "", prompt)
        prompt = re.sub(r"^(?:Answer:\s*)+", "", prompt).strip()
        prompt = re.sub(r"^(?:\d+ (?:questions|items) · .*?(?:minutes|minute)\s+)+", "", prompt)
        prompt = re.sub(r"^(?:DIRECTIONS|The questions in this section|Multiple-choice questions:|Student-produced response|All questions in this section|Listen and Choose a Response|You will hear a person speak\.|Complete the Words\.).*?(?=\s[A-Z])", "", prompt, count=1)
        if "single best answer." in prompt[:700] or "real number." in prompt[:900]:
            prompt = re.sub(r"^.*?(?:single best answer\.|real number\.)\s*", "", prompt, count=1, flags=re.S)
        prompt = prompt.strip()
        if len(prompt) < 2:
            continue
        number = int(match.group(1))
        instruction = next((text for a, b, text in directions if a <= number <= b), "")
        if instruction:
            prompt = clean(prompt.replace(instruction.split(": ", 1)[-1], ""))
        items.append({
            "number": number,
            "prompt": prompt[:2500],
            "instruction": instruction,
            "options": options,
            "audio": audio.group(1).strip() if audio else None,
        })
    return items


def build_question(raw, answer, section, audio=None, kind=None):
    accepted = list(answer.get("accepted") or [])
    primary = answer.get("answer") or ""
    if primary and primary not in accepted:
        accepted.insert(0, primary)
    options = raw["options"]
    stored = primary
    if options and letter_index(primary) is not None:
        stored = letter_index(primary)
        accepted = [stored]
    item = {
        "prompt": pair(raw["prompt"]),
        "options": [{"en": o, "mn": o} for o in options] if options else None,
        "answer": stored,
        "accepted": accepted or None,
        "section": section,
        "passage": "",
        "explanation": pair(answer.get("explanation") or "Compare your answer with the key.", answer.get("explanation") or NOTE),
    }
    if raw.get("instruction"):
        item["instruction"] = raw["instruction"]
    if audio:
        item["audio"] = audio
    if kind:
        item["kind"] = kind
    if not options and not kind:
        item["accepted"] = [a for a in accepted if letter_index(a) is None] or accepted
        item["answer"] = item["accepted"][0] if item["accepted"] else primary
    return item


def attach(items, answers, section, audio_for):
    built = []
    for raw in items:
        answer = answers.get(raw["number"], {"answer": "", "accepted": [], "explanation": ""})
        audio = audio_for(raw) if audio_for else None
        built.append(build_question(raw, answer, section, audio))
    return built


def copy_audio(src, dest_name, exam, number):
    if not src or not src.exists():
        return None
    folder = MEDIA / exam / f"{number:02d}"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / dest_name
    if not target.exists() or target.stat().st_size != src.stat().st_size:
        shutil.copy2(src, target)
    return f"/media/{exam}/{number:02d}/{dest_name}"


def extract_tree(work):
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    for exam, zips in ZIPS.items():
        for archive in zips:
            with zipfile.ZipFile(archive) as zf:
                zf.extractall(work / exam)


def sat_tests(root):
    tests = []
    for number in range(1, 11):
        folder = root / "sat" / f"Test{number:02d}"
        booklet = text_of(next(folder.glob("*Student_Booklet.pdf")))
        key = parse_answers(text_of(next(folder.glob("*Answer_Key.pdf"))))
        chunks = re.split(r"(?m)^[ \t]*(Reading and Writing - Module [12]|Math - Module [12])[ \t]*$", booklet)
        sections = []
        spec = {
            "Reading and Writing - Module 1": ("rw1", "Reading & Writing", "Reading & Writing, module 1", 32),
            "Reading and Writing - Module 2": ("rw2", "Reading & Writing", "Reading & Writing, module 2", 32),
            "Math - Module 1": ("math1", "Math", "Math, module 1", 35),
            "Math - Module 2": ("math2", "Math", "Math, module 2", 35),
        }
        for i in range(1, len(chunks), 2):
            title, body = chunks[i], chunks[i + 1]
            sid, section, label, minutes = spec[title]
            questions = attach(questions_in(body), key.get(title, {}), section, None)
            sections.append({"id": sid, "label": label, "minutes": minutes, "questions": questions})
        tests.append({"exam": "sat", "number": number, "sections": sections})
    return tests


def ielts_tests(root):
    tests = []
    for number in range(1, 11):
        folder = root / "ielts" / f"Test{number:02d}"
        booklet = text_of(next(folder.glob("*Student_Booklet.pdf")))
        key = parse_answers(text_of(next(folder.glob("*Answer_Key.pdf"))))
        chunks = re.split(r"(?m)^[ \t]*(LISTENING|READING|WRITING|SPEAKING)[ \t]*$", booklet)
        named = {chunks[i]: chunks[i + 1] for i in range(1, len(chunks), 2)}
        listening = []
        for part in range(1, 5):
            audio = copy_audio(folder / "audio" / f"listening_part{part}.mp3", f"listening-part{part}.mp3", "ielts", number)
            part_text = re.split(rf"(?m)^[ \t]*PART {part}\b", named.get("LISTENING", ""))
            body = part_text[1] if len(part_text) > 1 else ""
            if part < 4:
                body = re.split(r"(?m)^[ \t]*PART \d+\b", body)[0]
            listening += attach(questions_in(body), key.get("LISTENING", {}), "Listening", lambda _raw, audio=audio: audio)
        reading = attach(questions_in(named.get("READING", "")), key.get("READING", {}), "Reading", None)
        writing_raw = questions_in(named.get("WRITING", "")) or [{
            "number": 1, "prompt": clean(named.get("WRITING", ""))[:4000], "options": None, "audio": None
        }]
        writing = []
        for raw in writing_raw[:2]:
            item = build_question(raw, {"answer": "", "accepted": [], "explanation": "Compare your response with the model answer in the source key."}, "Writing", kind="essay")
            item["minWords"] = 150 if raw["number"] == 1 else 250
            writing.append(item)
        speaking_audio = copy_audio(folder / "audio" / "speaking_examiner_prompts.mp3", "speaking.mp3", "ielts", number)
        speaking_raw = questions_in(named.get("SPEAKING", "")) or [{
            "number": 1, "prompt": clean(named.get("SPEAKING", ""))[:4000], "options": None, "audio": None
        }]
        speaking = [build_question(raw, {"answer": "", "accepted": [], "explanation": "Record your answer and compare it with the band descriptors."}, "Speaking", speaking_audio, "speaking") for raw in speaking_raw[:3]]
        tests.append({"exam": "ielts", "number": number, "sections": [
            {"id": "listening", "label": "Listening", "minutes": 40, "questions": listening},
            {"id": "reading", "label": "Reading", "minutes": 60, "questions": reading},
            {"id": "writing", "label": "Writing", "minutes": 60, "questions": writing},
            {"id": "speaking", "label": "Speaking", "minutes": 14, "questions": speaking},
        ]})
    return tests


def toefl_tests(root):
    tests = []
    for number in range(1, 11):
        folder = root / "toefl" / f"Test{number:02d}"
        booklet = text_of(next(folder.glob("*Student_Booklet.pdf")))
        key = parse_answers(text_of(next(folder.glob("*Answer_Key.pdf"))))
        def audio_for(raw, folder=folder, number=number):
            if not raw.get("audio"):
                return None
            source = folder / "audio" / "listening" / raw["audio"]
            if not source.exists():
                source = folder / "audio" / raw["audio"]
            return copy_audio(source, Path(raw["audio"]).name, "toefl", number)
        chunks = re.split(r"(?m)^[ \t]*(Reading - Module [12]|Listening - Module [12]|Build a Sentence|Write an Email|Write for an Academic Discussion|Listen and Repeat|Take an Interview)(?: \([^)\n]+\))?[ \t]*$", booklet)
        named = {}
        for i in range(1, len(chunks), 2):
            named[chunks[i]] = chunks[i + 1]
        reading = []
        for title, sid in (("Reading - Module 1", "reading1"), ("Reading - Module 2", "reading2")):
            reading += attach(questions_in(named.get(title, "")), key.get(title, {}), "Reading", None)
        listening = []
        for title in ("Listening - Module 1", "Listening - Module 2"):
            listening += attach(questions_in(named.get(title, "")), key.get(title, {}), "Listening", audio_for)
        writing = attach(questions_in(named.get("Build a Sentence", "")), key.get("Build a Sentence", {}), "Writing", None)
        for title, minutes in (("Write an Email", 7), ("Write for an Academic Discussion", 10)):
            body = named.get(title.split(" (")[0], "")
            if not body.strip():
                continue
            raw = {"number": 11 if "Email" in title else 12, "prompt": clean(body)[:4000], "options": None, "audio": None}
            writing.append(build_question(raw, {"answer": "", "accepted": [], "explanation": "Score this response yourself using the 0–5 rubric."}, "Writing", kind="essay"))
        speaking = []
        for title in ("Listen and Repeat", "Take an Interview"):
            source = folder / "audio" / "speaking_full.mp3"
            audio = copy_audio(source, "speaking.mp3", "toefl", number)
            found = questions_in(named.get(title, ""))
            if not found and named.get(title, "").strip():
                found = [{"number": len(speaking) + 1, "prompt": clean(named[title])[:2000], "options": None, "audio": None}]
            speaking += [build_question(raw, {"answer": "", "accepted": [], "explanation": "Record your answer and compare it with the sample."}, "Speaking", audio, "speaking") for raw in found]
        tests.append({"exam": "toefl", "number": number, "sections": [
            {"id": "reading", "label": "Reading", "minutes": 30, "questions": reading},
            {"id": "listening", "label": "Listening", "minutes": 29, "questions": listening},
            {"id": "writing", "label": "Writing", "minutes": 23, "questions": writing},
            {"id": "speaking", "label": "Speaking", "minutes": 8, "questions": speaking},
        ]})
    return tests


def expect(test, section_id, count):
    section = next(s for s in test["sections"] if s["id"] == section_id)
    got = len(section["questions"])
    if got != count:
        raise SystemExit(f"{test['exam']} {test['number']} {section_id}: expected {count}, got {got}")


def main():
    work = Path("/tmp/full-length-tests")
    extract_tree(work)
    tests = sat_tests(work) + ielts_tests(work) + toefl_tests(work)
    for test in tests:
        if test["exam"] == "sat":
            expect(test, "rw1", 27)
            expect(test, "rw2", 27)
            expect(test, "math1", 22)
            expect(test, "math2", 22)
        elif test["exam"] == "ielts":
            expect(test, "listening", 40)
            expect(test, "reading", 40)
        elif test["exam"] == "toefl":
            expect(test, "reading", 50)
            expect(test, "listening", 47)
    OUT.write_text(json.dumps(tests, ensure_ascii=False), encoding="utf8")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes) from {len(tests)} tests")


if __name__ == "__main__":
    main()
