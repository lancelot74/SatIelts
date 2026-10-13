# Content provenance and editorial notes

The original six user-provided PDFs are kept in `source/`. Their text was extracted with PyMuPDF. The website does not embed or expose the PDF files.

## Included interactive content

| Collection | Included numbered sets 1–5 | Questions/tasks |
| --- | --- | --- |
| IELTS | Listening (16), Reading (13), Writing (2), Speaking (3 grouped parts) per set | 170 |
| TOEFL | Reading (13–14, including word completion), Listening (8), Writing (3 keyed sentences + 2 essays), Speaking (2 grouped tasks) per set | 141 |
| SAT | Reading & Writing (10), Math (10) per set | 100 |

Each skill can be taken separately. A **full practice test** combines all sections of one numbered set, with one continuous timer and section navigation/results. The complete library contains 366 objectively scored items and 45 self-reviewed open-response tasks. Speaking parts may contain multiple prompts; counts refer to response groups in the player.

| Collection | Section times | Full set |
| --- | --- | --- |
| IELTS | Listening 16, Reading 20, Writing 60, Speaking 14 minutes | 110 minutes |
| TOEFL | Reading 20, Listening 10, Writing 23, Speaking 8 minutes | 61 minutes |
| SAT | Reading & Writing 13, Math 16 minutes | 29 minutes |

These are practice allocations, not claims about official exam duration or adaptive structure. Full practice sets are the shorter numbered sets in the source PDFs. The two separate bonus full-length tests are not imported.

Free section samples reuse selected tasks from set 1; a combined sample includes each section sample. IELTS samples have 6 Reading, 3 Listening, 1 Writing and 1 Speaking task; TOEFL has 5 Reading, 3 Listening, 1 Writing and 1 Speaking task; SAT has 3 Reading & Writing and 3 Math questions. The original mixed/reading sample URLs and saved runs remain compatible.

The PDFs provide listening scripts rather than audio. The app presents transcript practice with optional device-generated speech. IELTS scripts/questions originally in Mongolian have English adaptations while preserving the original Mongolian help. TOEFL scripts retain their English source wording. Microphone recordings are optional, local to the browser and downloadable; only typed notes/responses are saved to the account database. Writing and Speaking have review guidance and no fabricated automatic score. TOEFL sentence-building exercises do have keyed scores, separated in the section results.

All three study guides are organized into four lessons with their Mongolian source text and an English introduction. Interface language and question-hint visibility remain independent. Completion answers and essays are entered in English. Source PDFs and complete answer keys are private server content.

TOEFL publications identify the author as **Учрал Ууганбаяр**. Sources are supplied practice material, not official standardized test items. Source format claims are attributed to the source; the application does not convert percentages to official scores.

## Scoring adjustments

- SAT 1, Math 10 contains both `12` and `√144`: both choices are accepted.
- SAT 3, Reading & Writing 8 uses an appositive that permits paired dashes or paired commas: both are accepted. The original punctuation formatting is retained.
- SAT 2, Math 2 accepts `5`, `(0,5)` and `0,5`, since the prompt asks for a point while the key gives its y-coordinate.
- SAT 3, Math 6 expects `45π`; the original short key lists `45`, while the question explicitly requests the volume in terms of π. The corrected answer preserves the unit/form requested by the question.
- SAT 3, Math 10 accepts `5√2`, `5sqrt(2)`, `sqrt(50)` and `√50`.
- SAT 5, Math 9 explicitly says **positive** consecutive even integers to resolve the source's missing sign constraint.
- IELTS 3 summary-completion questions 6–9 are split into four individual input questions, preserving the source meaning and key.
- TOEFL Complete the Words removes parenthetical source answers from the test text. Learners enter the entire word; all blanks stay visible in their source paragraph.
- TOEFL sentence-building accepts the source order and valid alternative placements of the supplied location/time chunks. Letter case, whitespace, typographic apostrophes and final sentence punctuation do not affect scoring.
- IELTS Listening accepts number words and digits for equivalent numeric answers, and both `open-data` and `open data`.
- IELTS Writing tables are rendered inside the question, including Mongolian table labels when help is enabled. The general review rubric avoids reproducing the source's inaccurate claim that Country A has the largest increase in set 1: its increase is 42 percentage points, whereas Country C increases by 61.
- Question translations and answer-choice glosses were authored for this app. English grammar forms and punctuation are retained alongside a Mongolian explanation so translating them does not remove the distinctions being tested.

The answer keys and source documents are excluded from the client bundle and denied by the development server. They are returned only in authorized, completed attempt results. Writing and Speaking do not receive an automatic score.

The optional `scripts/import-sections.py` importer regenerates `sections.json` from the private PDFs plus the curated bilingual adaptations within that script. It does not alter the original question bank or any saved attempts.
