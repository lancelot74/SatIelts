"""Extract the five practice sets per exam. Run after editing curated-translations.json."""
import fitz,re,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def pages(name):
 with fitz.open(ROOT/'content/source'/name) as d:
  return [re.sub(r'\n(?:\d+\n)?(?:IELTS Academic ·[^\n]+|SAT Сорилын Шалгалтууд)\n(?:\d+\n)?','\n',p.get_text()) for p in d]
def clean(s): return re.sub(r'[ \t]+',' ',re.sub(r'\s*\n\s*',' ',s)).strip()
def bilingual(en,mn=None): return {'en':en,'mn':mn or en}
def question(prompt,options=None,answer=None,section='Reading',passage='',explanation=None,**extra):
 return dict(prompt=bilingual(prompt),options=[bilingual(o) for o in options] if options else None,answer=answer,section=section,passage=passage,explanation=bilingual(explanation or 'Review the source text and the correct answer.','Эх бичвэр болон зөв хариулттай харьцуулж шалгаарай.'),**extra)
sets={}
sat=pages('SAT_Mock_Tests_MN.pdf')
rwkeys=['CBBBBCBCBB','CBBBBCBBBB','CBBBBBCABB','CBBBBCBCBB','CBBCACBBBB']
mathkeys=[['5','10','100','-7','30','26','11','17','50','12'],['7','5','24','x^7','60','4','32','6','7','72'],['7','4','25%','3','15','45π','5','5','25','5√2'],['5','-7','$92','12','15','32','15','65','3','140'],['4','-7','60','5','16','30','3','80','8','8']]
for n in range(5):
 qs=[];start=2+n*6
 explanationText='\n'.join(sat[start+4:start+6]); parts=explanationText.split('Дэлгэрэнгүй тайлбар — ')
 for section,a,b in [('Reading & Writing',start,start+2),('Math',start+2,start+4)]:
  text='\n'.join(sat[a:b]);matches=list(re.finditer(r'(?m)^\s*(\d+)\.\s+',text))
  for j,m in enumerate(matches):
   block=text[m.end():matches[j+1].start() if j+1<len(matches) else len(text)]
   options=re.findall(r'\([ABCD]\)\s*(.*?)(?=\([ABCD]\)|\Z)',block,re.S)
   prompt=clean(re.split(r'\(A\)|\(Өөрөө',block)[0]); opts=[clean(o) for o in options] or None
   answer=rwkeys[n][j] if section=='Reading & Writing' else mathkeys[n][j]
   if section=='Reading & Writing': answer=ord(answer)-65
   elif opts:
    hits=[i for i,o in enumerate(opts) if o==answer]
    answer=hits[0] if hits else None
   item=question(prompt,opts,answer,section)
   if section=='Math' and not opts: item['accepted']=[str(answer)]
   if section=='Math' and j==9 and n==0: item['answer']=[1,3] # Both 12 and √144 are correct in the source.
   if section=='Reading & Writing' and j==7 and n==2: item['answer']=[0,3] # Paired dashes and commas both delimit the appositive.
   if section=='Math' and n==1 and j==1: item['accepted']=['5','(0,5)','0,5']
   if section=='Math' and n==1 and j==3: item['accepted']=['x^7','x⁷']
   if section=='Math' and n==2 and j==5: item['accepted']=['45π','45pi','45*pi']
   if section=='Math' and n==2 and j==9: item['accepted']=['5√2','5sqrt(2)','sqrt(50)','√50']
   if section=='Math' and n==4 and j==8:
    item['prompt']['en']='The product of two consecutive positive even integers is 48. What is the larger?'
   for ep in parts[1:]:
    if ep.startswith(section):
     found=re.search(r'(?m)^'+str(j+1)+r'\. Зөв хариу:[^\n]*\n(.*?)(?=\n\d+\. Зөв хариу:|\Z)',ep,re.S)
     if found:item['explanation']['mn']=clean(found.group(1))
   if item['answer'] is None: raise ValueError((n,j,prompt,opts,mathkeys[n][j]))
   qs.append(item)
 sets[f'sat-{n+1}']={'exam':'sat','number':n+1,'minutes':29,'questions':qs,'source':'SAT_Mock_Tests_MN.pdf'}
# IELTS reading sets: preserve the complete reading passages and all thirteen questions.
ielts=pages('IELTS_Mock_Tests_MN.pdf')
keys=[['True','False','True','Not Given','True','sponges','sediments','ditches','privately',1,1,1,1],['True','True','False','True','Not Given','layout','tactile','thousands','visual',1,1,0,1],['False','True','True','Not Given','True','memories','tissue','restoration','debt',1,1,1,1],['True','False','False','True','False','costs','footfall','hours','loyalty',1,1,1,1],['True','True','True','False','True','fragments','speed','chain','orbit',1,0,1,1]]
for n in range(5):
 p=ielts[4+n*6];p=re.sub(r'^READING\s*(?:Дараах.*?\n|Текстийг.*?\n)?','',p)
 text=ielts[5+n*6]
 if n==2:
  a=text.index('During',text.index('Асуулт 6')); b=text.index('Асуулт 10–13')
  text=text[:a]+'6. During sleep the brain consolidates ____________.\n7. The sleeping brain clears waste and repairs ____________.\n8. The deepest stages support physical ____________.\n9. Modern habits create a chronic sleep ____________.\n'+text[b:]
 matches=list(re.finditer(r'(?m)^\s*(\d+)\.\s+',text));qs=[]
 for j,m in enumerate(matches):
  block=text[m.end():matches[j+1].start() if j+1<len(matches) else len(text)]
  block=re.split(r'Асуулт \d+',block)[0].strip();block=re.sub(r'\n\d+\s*$','',block)
  options=['True','False','Not Given'] if j<5 else [clean(x) for x in re.findall(r'[ABC]\.\s*(.*?)(?=\s+[ABC]\.|\Z)',block,re.S)] or None
  prompt=clean(re.split(r'\s+A\.',block)[0]); answer=keys[n][j]
  if j<5:answer=options.index(answer)
  qs.append(question(prompt,options,answer,passage=p))
 assert len(qs)==13,(n,len(qs))
 sets[f'ielts-{n+1}']={'exam':'ielts','number':n+1,'minutes':20,'questions':qs,'source':'IELTS_Mock_Tests_MN.pdf'}
# TOEFL reading: Daily Life and Academic Passage tasks (four + five questions per set).
toefl=pages('TOEFL_2026_5_Mock_Tests_MN.pdf')
for n in range(5):
 text='\n'.join(toefl[4+n*10:7+n*10]);text=text.split('Listening\n')[0]
 text=text[text.index('Reading · Part 2:'):]
 acad=text.index('Reading · Part 3:');daily=text[:acad];academic=text[acad:];qs=[]
 for group,body in [('Daily Life',daily),('Academic Passage',academic)]:
  matches=list(re.finditer(r'Q(\d+)\.\s*',body))
  passage=body[:matches[0].start()]
  for j,m in enumerate(matches):
   block=body[m.end():matches[j+1].start() if j+1<len(matches) else len(body)]
   # The second Daily Life text is between Q2 and Q3.
   if group=='Daily Life' and j==1:
    cut=re.search(r'TEXT B[^\n]*\n',block)
    if cut: nextpassage=block[cut.start():];block=block[:cut.start()]
    else: nextpassage=passage
   if group=='Daily Life' and j==2:passage=nextpassage
   chunks=re.split(r'\n\s*([ABCD])\s*\n',block)
   prompt=clean(chunks[0]); options=[clean(chunks[k]) for k in range(2,len(chunks),2)]
   if options: options[-1]=re.sub(r'\s*Сорил \d+\s*\d+\s*$','',options[-1]).strip()
   qs.append(question(prompt,options,None,passage=passage))
 # Read answer keys via the PDF's table cells in reading order.
 answers=['BBBA'+'BCACB','BBBB'+'BBBBB','BABB'+'BBBAB','ABBB'+'ABBAB','BBBB'+'ABBAA'][n]
 for i,q in enumerate(qs):q['answer']=ord(answers[i])-65
 assert len(qs)==9,(n,len(qs))
 sets[f'toefl-{n+1}']={'exam':'toefl','number':n+1,'minutes':15,'questions':qs,'source':'TOEFL_2026_5_Mock_Tests_MN.pdf'}
for key,test in sets.items():
 for i,q in enumerate(test['questions']):q['id']=str(i)
(ROOT/'content/tests.json').write_text(json.dumps(sets,ensure_ascii=False,indent=2))
print({k:len(v['questions']) for k,v in sets.items()})
