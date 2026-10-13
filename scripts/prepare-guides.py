from pathlib import Path
import fitz,json,re
root=Path(__file__).resolve().parents[1]
config={
'ielts':('IELTS_Study_Guide_MN.pdf',[
('Know your exam','Шалгалтаа ойлгох',3,7,'IELTS Academic covers Listening, Reading, Writing and Speaking. Work on each skill separately, then bring them together in timed practice. This guide explains the format, assessment and planning. Practice percentages on this website are not official IELTS band scores.'),
('A plan you can keep','Тууштай сурах төлөвлөгөө',8,9,'Start with a diagnostic exercise. Record what went wrong: vocabulary, misunderstood instructions or time pressure. Focus on two weaker skills. Make a repeatable weekly plan with small daily tasks and time to review mistakes.'),
('Listen and read with purpose','Зорилготой сонсож, унших',10,13,'Read the instructions before answering. Preview questions, identify keywords, and listen or read for paraphrases rather than exact wording. For True / False / Not Given, distinguish a contradiction from information the passage never provides. Use transcript exercises as practice; the supplied book does not contain audio recordings.'),
('Develop your writing and speaking','Бичих ба ярих чадвар',14,22,'For Writing Task 1, identify the main trends and compare relevant figures. In Task 2, take a clear position, support it with examples and review your language. For Speaking, develop an answer with reasons and examples. Record yourself and check clarity, fluency and repetition. Writing and Speaking require human assessment for a reliable band score.')]),
 'toefl':('TOEFL_2026_Study_Guide_MN.pdf',[
('Meet the 2026 format','2026 оны бүтэцтэй танилцах',4,9,'The supplied guide introduces the 2026 TOEFL iBT task types across Reading, Listening, Writing and Speaking. These website exercises are fixed practice sets and do not simulate the official adaptive test or produce official scaled scores.'),
('Reading, one task at a time','Унших даалгаврын төрлүүд',10,14,'Practise completing words, reading daily-life texts and understanding academic passages. Look for purpose, details, vocabulary in context and supported inferences. Distinguish what is stated from what can reasonably be inferred.'),
('Listening for meaning','Утгыг ойлгож сонсох',15,19,'Practise choosing an appropriate response, following a conversation, understanding announcements and taking notes during an academic talk. Notice a speaker’s purpose and the organization of ideas. The provided mock-test book supplies transcripts rather than recorded audio.'),
('Write, speak, then review','Бич, ярь, дараа нь шалга',20,38,'Build grammatical sentences, write an email with a clear purpose and contribute to an academic discussion. Practise listening and repeating, and answering interview prompts directly with supporting examples. The original guide includes practice prompts, vocabulary and a study schedule.')]),
 'sat':('SAT_Study_Guide_MN.pdf',[
('Your Digital SAT starting point','Digital SAT-ийн эхлэл',3,4,'The Digital SAT assesses Reading & Writing and Math. Official tests use adaptive modules; these 20-question website sets are shorter, fixed practice exercises. Their raw scores cannot be converted reliably into a 400–1600 SAT score.'),
('Read closely. Write clearly.','Уншиж ойлго. Зөв найруул.',5,7,'Build vocabulary in context, identify an author’s purpose and examine evidence. In grammar tasks, find the true subject, keep parallel structures consistent and decide whether each clause is complete before choosing punctuation.'),
('Make the math make sense','Математикийн учрыг олох',8,11,'Practise algebra, functions, percentages, ratios and geometry. Translate a word problem into an equation, keep track of units and check the result against the question. For an equation with multiple roots, pay attention to positive, negative, larger or smaller.'),
('Turn mistakes into a plan','Алдаанаасаа төлөвлөгөө гаргах',12,15,'Keep an error log with the topic, what went wrong and the rule you needed. Use short timed sessions followed by deliberate review. Learn the official test interface separately and practise with official full-length materials as well.')])}
out={}
for exam,(file,chapters) in config.items():
 with fitz.open(root/'content/source'/file) as d:
  result=[]
  for n,(en,mn,start,end,summary) in enumerate(chapters):
   end=min(end,len(d))
   body='\n\n'.join(p.get_text(sort=True).strip() for p in list(d)[start-1:end])
   result.append({'id':n,'title':{'en':en,'mn':mn},'summary':{'en':summary,'mn':mn+' — доорх эх материалын тайлбар, жишээ болон дасгалаар суралцаарай.'},'body':body,'pages':f'{start}–{end}'})
  out[exam]={'source':file,'chapters':result,'pageCount':len(d)}
(root/'content/guides.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
print('Prepared 12 lessons from all three study guides.')
