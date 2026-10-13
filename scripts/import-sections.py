"""Import the remaining numbered practice sections; requires PyMuPDF.
The English IELTS listening adaptations and Mongolian task translations below
are editorial content. The source PDFs remain private and are never embedded.
"""
import fitz, re, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def pages(name):
    with fitz.open(ROOT/'content/source'/name) as doc:
        return [re.sub(r'\n(?:\d+\nIELTS Academic ·[^\n]+|(?:Сорил \d+|Test \d+ — Answer Key[^\n]*)\n\d+)\n?', '\n', p.get_text()).strip() for p in doc]
def clean(s): return re.sub(r'\s+', ' ', s).strip()
def bi(en,mn): return {'en':en,'mn':mn}
def q(en,mn,section,answer=None,options=None,**kw):
    return dict(prompt=bi(en,mn),section=section,answer=answer,options=options,passage='',explanation=bi('Compare your answer with the source and the answer key.','Хариултаа эх бичвэр болон хариуны түлхүүртэй харьцуулаарай.'),**kw)
IELTS_PROMPTS = [
['Surname: ____','Address: 14 ____ Road','Membership type: ____','Annual premium fee: £____','Maximum number of books: ____','Return within ____ weeks','Late fee per day: ____ pence','Author events take place on ____', 'The original topic was too ____.','The data will come from the city’s ____ database.','The most time-consuming part will be the residents’ ____.','The first draft is due in ____ weeks.',
('What is the fastest way to conduct the survey?',['By phone','Online','Face to face']),('What should the conclusion include?',['A budget','Policy recommendations','Pictures']),('Where did the student lose most marks last time?',['The conclusion','Source citations','The data']),('How does the student seem?',['Uncertain','Prepared','Careless'])],
['Number of nights: ____','Number of people: ____','Apartment type: ____','Price per night: £____','Not allowed: ____','Check-out time: ____ a.m.','Deposit: £____','Booking code: ____','In the early 1900s, about one ____ of cars were electric.','____ oil contributed to the decline of electric cars.','The modern revival began with advances in ____ technology.','The biggest barrier is charging ____.',
('What is the lecturer’s main point?',['Electric cars are a new invention','Electric cars existed long ago','Petrol cars will always dominate']),('What is one research goal?',['Increase battery density','Raise prices','Reduce speed']),('Where will the main future change occur?',['In the tyres','In the energy supplying the cars','In the colour']),('What is the lecturer’s tone?',['Doubtful','Informative','Critical'])],
['Number of floors: ____','Ancient artefacts are on the ____ floor.','Photography is allowed, but ____ is prohibited.','Leave bags in a ____.','Guided tours start at 11 and ____.','The café is on the ____ floor.','The special exhibition features ancient ____.','The exhibition closes after ____.','____ light from screens disrupts sleep.','This light suppresses the hormone ____.','There were ____ participants.','The main limitation: participants recorded their sleep ____.',
('What is the clearest finding?',['Exercise improves sleep','Evening screens disrupt sleep','Coffee has no effect']),('How could the study become more accurate?',['Use measuring devices','Add more questionnaires','Allow more time']),('What is the practical recommendation?',['Get up early','Avoid screens before bed','Sleep during the day']),('How would you describe the student’s approach?',['Cautious and evidence-based','Careless','Overly optimistic'])],
['Course subject: ____','Classes take place on ____.','Class time: 6–____ p.m.','Advance payment: £____','Bring your own ____.','Class size: ____ people','Teacher: Mr. ____','Registration code: ____','Small businesses provide more than ____ of all jobs.','Small organisations are more ____ than corporations.','The most common problem is poor ____ management.','Government support includes tax ____.',
('Why are small businesses important for innovation?',['They are cheap','They are flexible and willing to take risks','They have many employees']),('What is the main cause of failure?',['Poor products','Cash flow','Too many orders']),('Which is an example of government support?',['Loan guarantees','Free offices','Advertising']),('What is the lecturer’s position?',['Small businesses are important','Small businesses are doubtful investments','Small businesses should be opposed'])],
['Chosen activity: planting ____','Activity day: ____','The activity ends at ____.','Register ____ days in advance.','Bring your own ____.','Minimum age: ____','Meet at the park’s ____ gate.','Contact code: ____','Inactive ____ and rocket remains collect in orbit.','Small fragments are dangerous because of their high ____.','The chain reaction is called the ____ syndrome.','The most effective solution is ____.',
('Why are small fragments dangerous?',['They are poisonous','They move very fast','They are large']),('What happens in the Kessler syndrome?',['One collision triggers many more','Temperatures rise','Light pollution increases']),('Which clean-up methods are being tested?',['Nets and magnets','Rockets','Telescopes']),('Which solution does the lecturer emphasise?',['Cleaning up','Prevention','Leaving the debris alone'])],
]
IELTS_KEYS = [
['Barrett','Maple','premium','25','8','3','20','Tuesday','broad','open-data','survey','2',1,1,1,1],
['5','4','Ocean','90','pets','11','100','SV4192','third','cheap','battery','infrastructure',1,0,1,1],
['3','first','flash','locker','2','second','coins','Sunday','blue','melatonin','45','themselves',1,0,1,0],
['photography','Wednesday','8','140','camera','12','Coleman','PH330','half','flexible','cash flow','relief',1,1,0,0],
['trees','Saturday','noon','5','water','16','north','GH205','satellites','speed','Kessler','prevention',1,0,0,1],
]
IELTS_SCRIPTS = [
['''Staff: Good afternoon, City Public Library.
Customer: Hello, I would like a membership card.
Staff: Of course. Could I have your name?
Customer: Sophie Barrett — B-A-R-R-E-T-T.
Staff: Your address?
Customer: 14 Maple Road.
Staff: Standard membership is free. Premium costs £25 a year and includes audiobooks and online resources.
Customer: I need the online resources, so I will take premium.
Staff: You may borrow up to eight books for three weeks. Late returns cost 20 pence per day. We also hold author events every Tuesday.
Customer: That sounds great. I will come.''',
'''Tutor: Let's discuss your project. What topic did you choose?
Student: Urban green spaces. I first considered air pollution, but it was too broad, so I narrowed it down.
Tutor: A sensible decision. Where will your data come from?
Student: The city's open-data database. The residents' survey will probably be the hardest part because collecting responses takes time.
Tutor: An online survey would be faster. Your first draft is due in two weeks.
Student: Should I include policy recommendations in the conclusion?
Tutor: Definitely. That makes the work practical. Cite your sources properly too; that is where you lost most marks last time.'''],
['''Staff: Seaview holiday apartments. How can I help?
Customer: I would like to rent an apartment for five nights, for four people.
Staff: We offer Garden and Ocean apartments. Ocean costs £90 per night and has a sea view.
Customer: I will take Ocean.
Staff: It includes a washing machine and wifi. Pets are not allowed. Check-in is at 3 p.m. and check-out at 11 a.m.
Customer: How much is the deposit?
Staff: £100, refundable on departure. Your booking code is SV4192.
Customer: SV4192. I've written it down.''',
'''Lecturer: Electric cars are not a new invention. In the early 1900s, almost one third of American cars were electric. Cheap oil and mass production of petrol engines then pushed them aside.
Their modern revival is based on advances in battery technology. Charging infrastructure remains the biggest barrier: electricity networks and charging stations are insufficient. Researchers aim to increase battery density and shorten charging times. The main future change will be in the growing share of renewable energy supplying the cars, rather than in the cars themselves.'''],
['''Guide: Welcome to the City History Museum. The museum has three floors. Ancient artefacts are on the first floor, the city's development is on the second, and temporary exhibitions are on the third.
Photography is allowed, but flash is prohibited. Leave bags and large items in a locker near the entrance.
Free guided tours start at 11 and 2 every day. The shop is near the exit and the café is on the second floor. Today's special exhibition features ancient coins. It is open only until Sunday, so don't miss it.''',
'''Tutor: Let's discuss your sleep study. What did you find?
Student: The clearest finding is that evening screen light disrupts sleep. Blue light suppresses the sleep hormone melatonin.
Tutor: How many people took part?
Student: Forty-five, monitored for two weeks. The main limitation was that participants recorded their sleep themselves, which could introduce errors. Measuring devices would improve accuracy in the future.
Tutor: What practical recommendation would you make?
Student: Avoiding screens for an hour before bed is the simplest effective advice.'''],
['''Staff: Lifelong Learning Centre.
Customer: I would like to register for the evening photography course.
Staff: It runs on Wednesdays from 6 to 8 p.m. for eight weeks. The fee is £160, or £140 if you pay in advance.
Customer: I will pay in advance. What should I bring?
Staff: Your own camera; we supply the other equipment. The class has twelve places. The teacher is Mr. Coleman.
Customer: When does it start?
Staff: September 14. Your registration code is PH330.''',
'''Lecturer: Small and medium-sized businesses provide more than half of all jobs in most countries. They are also important sources of innovation because small organisations are more flexible and willing to take risks than large corporations.
However, failure rates are high. The most common cause is not poor products but weak cash flow management: expenses must be paid before income arrives. Government support, including tax relief and loan guarantees, can help these businesses survive their first few years.'''],
['''Staff: Green Hands volunteering programme.
Customer: I would like to volunteer.
Staff: Would you prefer planting trees or cleaning the shore?
Customer: Planting trees.
Staff: That takes place every Saturday from 9 a.m. until noon. Register five days in advance.
Customer: What should I bring?
Staff: We provide gloves and tools, but bring your own water. Wear comfortable shoes. The minimum age is sixteen.
Customer: I'm nineteen. Where do we meet?
Staff: By the north gate of the city park. Your contact code is GH205.''',
'''Lecturer: Inactive satellites, rocket remains and small fragments have accumulated in Earth's orbit. They move at several kilometres per second, so even a tiny fragment can destroy an active satellite because of its speed.
The greatest danger is a chain reaction called the Kessler syndrome. One collision creates fragments that may trigger more collisions. Researchers are testing nets, magnets and specialised spacecraft for clean-up. But the most effective solution is prevention: designing satellites to leave orbit and burn up after their useful life.'''],
]
IELTS_WRITING_MN = [
['Дөрвөн улсын 2005, 2012, 2019 оны интернэттэй өрхийн хувийг хүснэгтэд үзүүлэв. Гол онцлогийг сонгон дүгнэж, холбогдох харьцуулалт хий. 150-аас доошгүй үг бич.','Зарим хүн засгийн газар байгаль хамгаалахад мөнгө зарцуулах ёстой гэдэг бол бусад нь ядуурлыг бууруулахад зарцуулах нь дээр гэж үздэг. Хоёр үзэл бодлыг хэлэлцэж, өөрийн байр суурийг илэрхийл. 250-аас доошгүй үг бич.'],
['Нэг улсын дөрвөн жилийн хэвлэмэл болон цахим номын борлуулалтыг саяар үзүүлэв. Гол онцлог, хандлагыг дүгнэн харьцуул. 150-аас доошгүй үг бич.','Зарим хүн хүүхдэд багаас нь технологи ашиглахыг заах хэрэгтэй гэдэг. Бусад нь энэ нь хортой байж болно гэж үздэг. Хоёр үзэл бодлыг хэлэлцэж, өөрийн байр суурийг илэрхийл. 250-аас доошгүй үг бич.'],
['Өнгөрсөн зууны гурван насны бүлгийн шөнийн дундаж унтсан цагийг үзүүлэв. Гол хандлагыг дүгнэн харьцуул. 150-аас доошгүй үг бич.','Олон оронд хүмүүс өмнөхөөсөө урт цагаар ажиллаж, бага унтаж байна. Үүний шалтгаан юу вэ? Хувь хүн болон нийгэмд ямар үр дагавартай вэ? 250-аас доошгүй үг бич.'],
['Кофены газрын нийт зардлын дөрвөн ангиллын хувийг үзүүлэв. Гол онцлогийг дүгнэн харьцуул. 150-аас доошгүй үг бич.','Олон улсын том компаниуд орон нутгийн нийгэмд хор хөнөөлөөсөө илүү ашиг тус авчирдаг гэж зарим хүн үздэг. Та хэр зэрэг санал нийлж эсвэл эсэргүүцэж байна вэ? 250-аас доошгүй үг бич.'],
['Гурван салбарын гурван өөр онд хөөргөсөн хиймэл дагуулын тоог үзүүлэв. Гол хандлагыг дүгнэн харьцуул. 150-аас доошгүй үг бич.','Зарим хүн засгийн газар сансрын судалгаанд мөнгө зарцуулах ёстой гэдэг. Бусад нь дэлхийн асуудлуудыг шийдвэрлэхэд зарцуулах хэрэгтэй гэж үздэг. Хоёр үзлийг хэлэлцэж, өөрийн байр суурийг илэрхийл. 250-аас доошгүй үг бич.'],
]
IELTS_TABLES = [
[['Country','2005','2012','2019'],['Country A','52%','78%','94%'],['Country B','30%','61%','88%'],['Country C','18%','45%','79%'],['Country D','12%','28%','63%']],
[['Year','Print (millions)','Digital (millions)'],['2016','180','60'],['2018','165','95'],['2020','158','120'],['2022','170','110']],
[['Age group','1920','1970','2020'],['Children','10.5','9.5','8.2'],['Adults','8.5','7.8','6.8'],['Older adults','7.5','7.2','6.9']],
[['Category','Percentage'],['Rent','35%'],['Salaries','30%'],['Raw materials','20%'],['Other (equipment, energy)','15%']],
[['Sector','1995','2005','2020'],['Government','85','70','60'],['Private companies','15','60','320'],['Universities','5','20','75']],
]
IELTS_SPEAKING_MN = [
['Та хаана амьдардаг вэ? Тэнд юу нь таалагддаг вэ?\nДотор эсвэл гадаа цаг өнгөрөөх дуртай юу? Яагаад?\nНийтийн тээврээр хэр олон зорчдог вэ?\nЯмар цаг агаарт хамгийн дуртай вэ?', 'Очоод таалагдсан байгалийн газраа дүрсэл. Хаана байдаг, хэзээ очсон, юу хийсэн, яагаад таалагдсаныг хэл. Нэг минут бэлдээд 1–2 минут ярь.', 'Хүмүүс яагаад байгальд байх дуртай вэ?\nЗасгийн газар байгалийн бүсийг хэрхэн хамгаалж болох вэ?\nХотуудад ногоон байгууламж хангалттай юу? Яагаад?\nИрээдүйд хүний байгальтай харилцах харилцаа хэрхэн өөрчлөгдөх вэ?'],
['Ном тогтмол уншдаг уу? Ямар төрлийнх вэ?\nЦаасан эсвэл дэлгэцээр унших дуртай юу?\nТехнологи таны сурах, ажиллах аргыг хэрхэн өөрчилсөн бэ?\nУтсан дээрээ ямар аппыг хамгийн их ашигладаг вэ?', 'Хэрэгтэй санагддаг технологио дүрсэл. Энэ нь юу, хэрхэн, хэр олон ашигладаг, яагаад хэрэгтэй болохыг хэл. Нэг минут бэлдээд 1–2 минут ярь.', 'Технологи хүмүүсийн харилцааг хэрхэн өөрчилсөн бэ?\nХүмүүс технологид хэт найдаж байна уу?\nХүүхэд багаасаа төхөөрөмж ашиглах нь ямар эрсдэлтэй вэ?\nИрэх хорин жилд анги танхим хэрхэн өөрчлөгдөх вэ?'],
['Ердийн үед хэдэн цаг унтдаг вэ?\nӨглөө эсвэл шөнө илүү идэвхтэй юу?\nӨдөр дугхийдэг үү?\nУнтахаасаа өмнө яаж тайвширдаг вэ?', 'Маш их ядарсан нэг үеэ дүрсэл. Хэзээ, яагаад ядарсан, юу хийсэн, дараа нь ямар мэдрэмж төрснийг хэл. Нэг минут бэлдээд 1–2 минут ярь.', 'Орчин үед олон хүн яагаад хангалттай унтдаггүй вэ?\nНойр дутуу байх нь ажилд хэрхэн нөлөөлдөг вэ?\nАжил олгогчид уян хатан цаг зөвшөөрөх ёстой юу?\nСургууль эрүүл дадалд хэрхэн туслах вэ?'],
['Кафе эсвэл ресторанд очих дуртай юу?\nОрон нутгийн жижиг дэлгүүр эсвэл том дэлгүүрийг илүүд үздэг үү?\nМөнгөө ихэвчлэн юунд зарцуулдаг вэ?\nЗарцуулалтын дадал тань саяхан өөрчлөгдсөн үү?', 'Мэддэг эсвэл эхлүүлэхийг хүсдэг жижиг бизнесээ дүрсэл. Юу хийдэг, юу санал болгодог, үйлчлүүлэгч нь хэн, яагаад сонирхолтойг хэл. Нэг минут бэлдээд 1–2 минут ярь.', 'Зарим жижиг бизнес яагаад амжилттай байхад бусад нь бүтэлгүйтдэг вэ?\nОрон нутгаас худалдан авахын давуу тал юу вэ?\nЗасгийн газар жижиг бизнест илүү туслах ёстой юу?\nЦахим худалдаа орон нутгийн дэлгүүрт хэрхэн нөлөөлсөн бэ?'],
['Сайн дурын ажил хийж байсан уу?\nНийгэмдээ туслах нь чухал уу?\nСансар, оддыг сонирхдог уу?\nСургуулийн байгалийн ухааны хичээлд дуртай байсан уу?', 'Хүнд тусалсан эсвэл сайн дурын ажил хийсэн үеэ дүрсэл. Юу хийсэн, хэнд, яагаад тусалсан, ямар мэдрэмж төрснийг хэл. Нэг минут бэлдээд 1–2 минут ярь.', 'Хүмүүс яагаад сайн дураар ажилладаг вэ?\nСургууль сурагчдад нийгмийн ажил заавал хийлгэх ёстой юу?\nСансрын судалгаанд зарцуулсан мөнгө үр өгөөжтэй юу?\nЗасгийн газар дэлхийн ямар асуудлыг түрүүлж шийдвэрлэх ёстой вэ?'],
]
sets={}
ip=pages('IELTS_Mock_Tests_MN.pdf')
num_words={'2':'two','3':'three','4':'four','5':'five','8':'eight','12':'twelve','16':'sixteen','20':'twenty','25':'twenty-five','45':'forty-five','90':'ninety','100':'one hundred','140':'one hundred forty'}
for n in range(5):
    sections={}; listening=[]
    source='\n'.join(ip[2+n*6:4+n*6])
    parts=re.split(r'(?m)^Section \d[^\n]*\n',source)[1:]
    assert len(parts)==2
    for group,body in enumerate(parts):
        matches=[m for m in re.finditer(r'(?<![\w])([0-9]{1,2})\.\s+',body) if group*8+1 <= int(m[1]) <= group*8+8]
        assert len(matches)==8,(n,group,len(matches))
        transcript=body[:matches[0].start()]
        transcript=re.split(r'Асуулт 9–12',transcript)[0]
        transcript=re.sub(r'^НЭГЭЭС[^\n]+\n','',transcript)
        for j,m in enumerate(matches):
            i=group*8+j
            raw=body[m.end():matches[j+1].start() if j<7 else len(body)]
            raw=re.split(r'Асуулт 13–16',raw)[0]
            chunks=re.split(r'\s+[ABC]\.\s*',raw)
            en=IELTS_PROMPTS[n][i]
            opts=[bi(a,clean(b)) for a,b in zip(en[1],chunks[1:])] if isinstance(en,tuple) else None
            item=q(en[0] if opts else en,clean(chunks[0]),'Listening',IELTS_KEYS[n][i],opts)
            item.update(passage=IELTS_SCRIPTS[n][group],passageMn=transcript.strip())
            if not opts:
                ans=item['answer']; item['accepted']=[ans]
                if ans in num_words:item['accepted'].append(num_words[ans])
                if ans=='open-data':item['accepted']+=['open data']
                if ans=='first':item['accepted']+=['1','1st']
                if ans=='second':item['accepted']+=['2','2nd']
                item['hint']=bi('Complete the gap in English, using words or numbers from the transcript.','Хоосон зайг эх бичвэрийн үг эсвэл тоогоор англиар нөхөөрэй.')
            listening.append(item)
    sections['listening']=listening
    writings=re.split(r'Writing Task [12][^\n]*\n',ip[6+n*6])[1:]
    sections['writing']=[]
    for i,raw in enumerate(writings):
        en=clean(re.split(r'\(Өгөгдөл|\n(?:Улс|Он|Насны бүлэг|Ангилал|Салбар)\n',raw)[0])
        en+=' Summarise the main features and make relevant comparisons. Write at least 150 words.' if i==0 else ' Write at least 250 words.'
        item=q(en,IELTS_WRITING_MN[n][i],'Writing',kind='essay',minWords=150 if i==0 else 250)
        if i==0:
            item['table']=IELTS_TABLES[n]
            terms={'Country':'Улс','Country A':'А улс','Country B':'Б улс','Country C':'В улс','Country D':'Г улс','Year':'Он','Print (millions)':'Хэвлэмэл (сая)','Digital (millions)':'Цахим (сая)','Age group':'Насны бүлэг','Children':'Хүүхэд','Adults':'Насанд хүрэгч','Older adults':'Ахмад настан','Category':'Ангилал','Percentage':'Хувь','Rent':'Түрээс','Salaries':'Цалин','Raw materials':'Түүхий эд','Other (equipment, energy)':'Бусад (тоног төхөөрөмж, эрчим хүч)','Sector':'Салбар','Government':'Засгийн газар','Private companies':'Хувийн компани','Universities':'Их сургууль'}
            item['tableMn']=[[terms.get(cell,cell) for cell in row] for row in item['table']]
        item['hint']=bi(f'Task {i+1} · Suggested time: {20 if i==0 else 40} minutes.',f'{i+1}-р даалгавар · Санал болгох хугацаа: {20 if i==0 else 40} минут.')
        item['explanation']=bi('Review task coverage, paragraph organisation, vocabulary and grammar. For Task 1, include an overview supported by accurate comparisons. For Task 2, develop a clear position with reasons and examples.','Даалгаврын шаардлага, догол мөрийн зохион байгуулалт, үгийн сан, дүрмээ шалга. Task 1-д ерөнхий тойм, зөв харьцуулалт оруул. Task 2-т тодорхой байр суурийг шалтгаан, жишээгээр хөгжүүл.')
        sections['writing'].append(item)
    speaking=re.split(r'(?m)^Part [123][^\n]*\n',ip[7+n*6])[1:]
    assert len(speaking)==3
    sections['speaking']=[]
    for i,body in enumerate(speaking):
        item=q(body.strip(),IELTS_SPEAKING_MN[n][i],'Speaking',kind='speaking')
        item['hint']=bi(f'Part {i+1}. '+('Prepare for 1 minute, then speak for 1–2 minutes.' if i==1 else 'Answer aloud, giving reasons and examples.'),f'{i+1}-р хэсэг. '+('1 минут бэлдээд, 1–2 минут ярь.' if i==1 else 'Чангаар хариулж, шалтгаан болон жишээ хэлээрэй.'))
        item['explanation']=bi('Listen back for fluency, clear pronunciation, vocabulary and grammatical range. Check that you answered every prompt and developed your ideas.','Ярианы урсгал, тод дуудлага, үгийн сан, дүрмийн хэрэглээгээ эргэн сонсож шалга. Асуулт бүрд хариулж, санаагаа дэлгэрүүлсэн эсэхээ үнэл.')
        sections['speaking'].append(item)
    sets[f'ielts-{n+1}']=sections
# Each row is the translated question followed by choices A–D.
TOEFL_LISTENING_MN = [
'''Хамгийн тохирох хариуг сонго. “Би багштай бүтэн долоо хоног холбогдох гэж оролдлоо. Тэр имэйлдээ ер хариулахгүй байна.”|Зөвлөгөө өгөх цагаар нь очиж үзсэн үү?|Имэйл маш урт байсан.|Тэр багшийн хичээл надад таалагддаг.|Номын сан өнөөдөр хаалттай.
Хамгийн тохирох хариуг сонго. “Үдээс хойших лекцийн өмнө өдрийн хоол идэх үү?”|Лекц биологийн тухай байсан.|Тэгье, үдэд хоолны газарт уулзах уу?|Би гэрийн даалгавраа дуусгасан.|Үгүй, надад тэр ном байхгүй.
Оюутан яагаад номоо буцаахыг хүссэн бэ?|Ном гэмтсэн.|Тэр хичээлээсээ гарч байгаа.|Буруу хэвлэл байна.|Хэт үнэтэй байсан.
Мөнгийг бүтнээр буцаахад ямар нөхцөл хэрэгтэй вэ?|Ном хэрэглээгүй, баримттай байх.|Оюутан хураамж төлөх.|30 хоногийн дотор буцаах.|Багш зөвшөөрөх.
Юу зарлаж байна вэ?|Шинэ эрүүл мэндийн төв.|Томуугийн үнэгүй вакцин.|Үнэмлэхийн дүрмийн өөрчлөлт.|Өвлийн амралтын хугацаа.
Оюутнууд юу авчрах ёстой вэ?|Цаг авсан хуудас.|Төлбөр.|Оюутны үнэмлэх.|Эмчийн бичиг.
Илтгэлийн гол сэдэв юу вэ?|Мод хавар хэрхэн ургадаг.|Навч намар яагаад өнгөө өөрчилдөг.|Хлорофилл хэрхэн үүсдэг.|Зарим мод яагаад ногоон хэвээр байдаг.
Шар, улбар шар өнгө намар яагаад харагддаг вэ?|Мод шинэ пигмент үүсгэдэг.|Өмнө нь байсан ч ногоон өнгөнд дарагдсан.|Навч нарны гэрэл шингээдэг.|Сахар навчийг шар болгодог.''',
'''Хамгийн тохирох хариуг сонго. “Ирэх улиралд эдийн засаг эсвэл сэтгэл судлалын алийг сонгохоо шийдэж чадахгүй байна.”|Сургалтын зөвлөхтэйгөө ярилцвал яасан юм?|Хоолны газар есөн цагт хаадаг.|Би сургалтын төлбөрөө төлсөн.|Economics гэдэг үг c үсэгтэй.
Хамгийн тохирох хариуг сонго. “Эдгээр хайрцгийг номын сан руу зөөхөд туслахгүй юу?”|Тэгье, хаана тавих вэ?|Номын санд олон ном бий.|Би тэр номыг өнгөрсөн жил уншсан.|Хайрцгийг картоноор хийдэг.
Оюутан юу хүсэж байна вэ?|Мөнгөө буцаах.|Дотуур байрны ганцаарчилсан өрөө.|Шинэ өрөөний хамтрагч.|Машины зогсоол.
Яагаад ганцаарчилсан өрөө хүссэн бэ?|Хямд учраас.|Хичээл хийхэд чимээгүй орчин хэрэгтэй.|Ангидаа ойрхон.|Найз нь тэнд амьдардаг.
Зарлалын гол зорилго юу вэ?|Шалгалтын үеэр номын сангийн цаг уртасгах.|Засварт хаах.|Шинэ номын санчийг танилцуулах.|Бүлгийн өрөөний төлбөр нэмэх.
Бүлгээр хичээллэх өрөөг хэрхэн захиалах вэ?|Хүлээн авах руу залгах.|Гурав хүртэл хоногийн өмнө цахимаар.|Зөвхөн тухайн өдөр.|Багш руу имэйл бичих.
Илтгэлийн гол сэдэв юу вэ?|Наймаалж хаана амьдардаг.|Наймаалж өнгөө өөрчилж хэрхэн далдлагддаг.|Наймаалж юу иддэг.|Наймаалж хэрхэн үрждэг.
Далдлах чадварыг нь яагаад гайхмаар гэжээ?|Өнгө ялгадаггүй ч орчныхоо өнгөтэй таардаг.|Маш удаан өнгөө өөрчилдөг.|Зөвхөн шөнө нуугддаг.|Хурдан хөдөлж чаддаггүй.''',
'''Хамгийн тохирох хариуг сонго. “Шүхрээ ангид орхисон юм шиг байна. Хэн нэгэн олсон болов уу?”|Олдсон эд зүйлийн албанаас асууж болно.|Өнөөдөр гадаа бороотой.|Анги маш хүйтэн байсан.|Би шүхэрт дургүй.
Хамгийн тохирох хариуг сонго. “Тэтгэлэг авсанд баяр хүргэе! Ямар санагдаж байна?”|Баярлалаа, үнэндээ одоо ч бага зэрэг гайхаж байна.|Тэтгэлгийн алба дээд давхарт.|Би өнөөдөр гурван хичээлтэй.|Мөнгийг цаасаар хийдэг.
Оюутан юу хүссэн бэ?|Илүү сайн дүн.|Судалгааны ажлын нэмэлт хугацаа.|Шинэ сэдэв.|Судалгаанд тусламж.
Багш оюутнаас юу хүссэн бэ?|Бүртгэл үлдээхийн тулд имэйл илгээх.|Эрүүл мэндийн төвд очих.|Ажлаа бүхэлд нь дахин бичих.|Ангид танилцуулга хийх.
Автобусны үйлчилгээнд ямар гол өөрчлөлт орсон бэ?|Илүү ойрхон давтамжтай явна.|Бүрэн зогсоно.|Тасалбарын үнэ нэмэгдэнэ.|Зөвхөн шөнө явна.
Шинэ цагийн хуваарийг хаанаас авах вэ?|Зөвхөн спортын төвөөс.|Их сургуулийн апп болон мэдээллийн ширээнээс.|Жолооч руу залгаж.|Сониноос.
Илтгэлийн гол сэдэв юу вэ?|Санах ойн эсээр бие өвчнийг хэрхэн санадаг.|Хүмүүс өвөл яагаад ханиад хүрдэг.|Нян хэрхэн тархдаг.|Вакцин яагаад үнэтэй байдаг.
Вакцины зарчмыг хэрхэн тайлбарласан бэ?|Дархлааг сулруулдаг.|Дархлаанд нянг аюулгүйгээр танихыг заадаг.|Санах ойн бүх эсийг устгадаг.|Зөвхөн хүүхдэд үйлчилдэг.''',
'''Хамгийн тохирох хариуг сонго. “Маргаашийн илтгэлдээ маш их сандарч байна.”|Санаа зоволтгүй, сайн бэлдсэн, чи чадна.|Өрөө хоёрдугаар давхарт.|Би өглөө үр тариа идсэн.|Илтгэл бол баримт бичиг.
Хамгийн тохирох хариуг сонго. “Уучлаарай, энэ суудал хүнтэй юу?”|Үгүй, сууж болно.|Би шинэ сандал авсан.|Хичээл арван цагт эхэлнэ.|Суудлыг модоор хийдэг.
Оюутан яагаад давтлагын төвд очсон бэ?|Ажилд орох.|Математик анализын хичээлд хүндрэлтэй байгаа.|Ном буцаах.|Хичээллэх өрөө олох.
Эхний хичээлийн талаар юу хэлсэн бэ?|Үнэгүй.|Заавал бүлгийнх байх.|Зөвхөн амралтын өдөр.|Багшийн бичиг хэрэгтэй.
Зарлал юуны тухай вэ?|Засварын улмаас ус түр таслах.|Галын сургуулилалт.|Түрээсийн өөрчлөлт.|Шинэ оршин суугч.
Оршин суугчдад юу зөвлөсөн бэ?|Байрнаас гарах.|Урьдчилан ус нөөцлөх.|Сантехникч дуудах.|Хураамж төлөх.
Илтгэлийн гол санаа юу вэ?|Нойр тархинд дурсамжийг бататгахад тусалдаг.|Оюутнууд шөнөжин хичээллэх хэрэгтэй.|Унтахад тархи унтардаг.|Зүүд шалгалтын дүнг хэлдэг.
Шалгалтын өмнө юу зөвлөсөн бэ?|Нойроо хасаж хичээллэх.|Шөнө сайн унтах.|Илүү кофе уух.|Зөвхөн өглөө хичээллэх.''',
'''Хамгийн тохирох хариуг сонго. “Энэ программыг нээх бүрд компьютер гацдаг.”|Дахин асаах эсвэл программаа шинэчлэх гэж үзсэн үү?|Компьютер маш хэрэгтэй.|Тэр программ надад ч таалагддаг.|Өнөөдөр хүйтэн байна.
Хамгийн тохирох хариуг сонго. “Өчигдөр орой хичээл хийхэд тусалсанд маш их баярлалаа.”|Зүгээр ээ, тус болсонд баяртай байна.|Номын сан хүн ихтэй байсан.|Надад шинэ үүргэвч хэрэгтэй.|Studying гэдэг үйл үг.
Оюутан юу асуусан бэ?|Тэтгэлэг байрны зардлыг даах эсэх.|Мэргэжлээ хэрхэн солих.|Номын сан хаана байдаг.|Хичээл хэзээ эхлэх.
Байрны зардалд юу санал болгосон бэ?|Их хэмжээний зээл.|Ажиллангаа суралцах хөтөлбөр.|Нэг хичээлээс гарах.|Кампусаас гадуур нүүх.
Тавдугаар сарын 1 гэхэд юу хийх ёстой вэ?|Оролцохоо баталж, малгай ба нөмрөг захиалах.|Сургалтын төлбөр төлөх.|Мэргэжил сонгох.|Номын сангийн ном буцаах.
Төгсөгч бүр хэдэн зочин урьж болох вэ?|Хоёр.|Дөрөв.|Зургаа.|Хязгааргүй.
Далайн түрлэгийг голчлон юу үүсгэдэг вэ?|Салхи.|Сарны татах хүч.|Далайн урсгал.|Дэлхийн дулаан.
Ихэнх эрэгт яагаад өдөрт хоёр удаа их түрлэг болдог вэ?|Дэлхий усны хоёр төвийлтийг дайран эргэдэг.|Сар хоёр удаа гардаг.|Бороо ордог.|Нар хоёр удаа жаргадаг.''',
]
TOEFL_EMAIL_MN = ['Цахимаар ном захиалсан боловч буруу нэртэй ном иржээ. Дэлгүүрт имэйл бич. Асуудлыг тайлбарлаж, ямар ном захиалснаа хэлээд шийдэл хүс.', 'Дотуур байрны хөрш орой чанга хөгжим тавьж, таныг унтуулахгүй байна. Байрны менежерт эелдэг имэйл бич. Асуудлыг тайлбарлаж тусламж хүс.', 'Тэтгэлгийн өргөдөлд хуучин багшаасаа тодорхойлох захидал авах хэрэгтэй. Өөрийгөө сануулж, юу хэрэгтэй, эцсийн хугацаа хэзээ болохыг тайлбарласан имэйл бич.', 'Зуны хэлний сургалтад суухыг хүссэн боловч сайтад хангалттай мэдээлэл алга. Зохион байгуулагчид имэйл бичиж, огноо, төлбөр, ангийн түвшнийг асуу.', 'Эмчийн цаг тань чухал хичээлтэй давхцжээ. Багшдаа имэйл бичиж нөхцөлийг тайлбарлан, уучлал хүсээд хоцорсон ажлыг нөхөж болох эсэхийг асуу.']
TOEFL_DISCUSSION_MN = ['Багш: Сургуульд хоёр дахь хэл сурахыг заавал болгох уу, сонголттой байлгах уу? Таны бодол?\nСара: Заавал байх хэрэгтэй. Өөр хэл мэдэх нь ажил, аяллын боломж нээдэг.\nТом: Сонголттой байх нь дээр. Хүн бүрт хэрэггүй бөгөөд албадах нь зарим хүний цагийг үрнэ.', 'Багш: Их сургуулийн ангид ухаалаг утас зөвшөөрөх ёстой юу? Яагаад?\nНина: Зөвшөөрөх хэрэгтэй. Мэдээлэл хурдан хайж, тэмдэглэл авч болно.\nОмар: Санал нийлэхгүй. Утас анхаарал сарниулж, лекцэд төвлөрөхийг бууруулдаг.', 'Багш: Их сургуулийн боловсрол хүн бүрд үнэгүй байх ёстой юу? Яагаад?\nЛена: Тийм. Орлогоос үл хамааран ижил боломж олгоно.\nРаж: Эргэлзэж байна. Хэн нэгэн төлнө, ихэвчлэн өндөр татвараар. Чанар муудаж магадгүй.', 'Багш: Их сургуулийн оюутан сурахын хажуугаар цагийн ажил хийх нь зөв үү? Яагаад?\nЭмма: Тийм. Бодит ур чадвар суулгаж, зардалд тусалдаг.\nКарлос: Санал нийлэхгүй. Ажил хичээлээс цаг, эрч хүчийг авч, дүнд муугаар нөлөөлдөг.', 'Багш: Уламжлалт шалгалтыг урт хугацааны төслөөр солих хэрэгтэй гэж зарим сурган хүмүүжүүлэгч үздэг. Та санал нийлэх үү?\nЮки: Тийм. Төсөл цээжлэхээс илүү бодит ойлголт, ур чадварыг шалгана.\nПитер: Үгүй. Шалгалт шударга, бодитой. Төслийг хуулж эсвэл өөр хүнээр хийлгэж болно.']
TOEFL_REPEAT_MN = [
'1. Музей сар бүрийн эхний Ням гарагт оюутнуудад үнэгүй.\n2. Хамгийн ойр автобусны буудал хаана байгааг хэлж өгнө үү?\n3. Багш хугацааг ирэх долоо хоногийн эцэс хүртэл хойшлуулсан.\n4. Олон сайн дурын ажилтан арга хэмжээг бэлдэхээр эрт ирсэн.\n5. Үдээс хойших анги хэт дүүрэн тул өглөөнийхийг сонгомоор байна.\n6. Судалгаа нойр ба ой санамжийн тодорхой холбоог харуулсан.\n7. Шалгалтад үнэмлэхээ авчрахаа санаарай.',
'1. Хотын төвийн галт тэрэг арван таван минут тутамд явдаг.\n2. Тэр мэргэжлээ биологиос инженерчлэл рүү солихоор шийдсэн.\n3. Уулзалтаа Пүрэв гарагт болгож болох уу?\n4. Энэ жорын ихэнх орц хямд.\n5. Уур амьсгалын өөрчлөлтийн лекц санаандгүй сонирхолтой байлаа.\n6. Тэр ярилцлагад хоцорсондоо уучлал хүссэн.\n7. Явахаасаа өмнө ажлаа хадгалаарай.',
'1. Хурлыг хотын төвийн том газар руу шилжүүлсэн.\n2. Баярын өдөр дэлгүүр нээлттэй эсэхэд эргэлзэж байна.\n3. Тогтмол дасгал сэтгэл санааг мэдэгдэхүйц сайжруулдаг.\n4. Төсөлд хувь нэмэр оруулсан бүх хүнд тэр талархсан.\n5. Зааврыг дахин нэг тайлбарлаж өгнө үү?\n6. Гүүрийг зуны турш засварт хаасан.\n7. Түгжрэлээс зайлсхийхийн тулд эрт гарах хэрэгтэй.',
'1. Өргөдлийн хугацааг сарын эцэс хүртэл сунгасан.\n2. Аль болох хурдан хариулбал баярлана.\n3. Эрдэмтэн үр дүнгээ энгийн үгээр тайлбарласан.\n4. Булан тойроод гайхалтай жижиг талхны газар бий.\n5. Нислэгээс дор хаяж нэг цагийн өмнө ирэхийг зөвлөсөн.\n6. Тэр машинаа хаана тавьснаа санахгүй байв.\n7. Шинэ бодлого ирэх оны эхээр хэрэгжинэ.',
'1. Хороо долоо хоногийн эцэст ялагчдыг зарлана.\n2. Баасан гарагийн уулзалтад очиж чадахгүй нь.\n3. Заавар тодорхой байсан тул даалгаврыг хийхэд амар байлаа.\n4. Тэд үдээс хойшжин хуучин хотоор аялсан.\n5. Ойрхон оройн хоол идэх сайн газар санал болгоно уу?\n6. Шөнө температур огцом буурах төлөвтэй.\n7. Нөхцөл байдлыг маш сайн зохицуулсан нь бүгдэд сэтгэгдэл төрүүлсэн.',
]
TOEFL_INTERVIEW_MN = [
'1. Шинэ газар аялах уу, танил газраа эргэж очих уу? Яагаад?\n2. Танай улсад ирсэн зочинд ямар газар санал болгох вэ?\n3. Аялал бусад соёлыг сурах хамгийн сайн арга гэдэгтэй санал нийлэх үү?\n4. Ирэх хорин жилд аялал хэрхэн өөрчлөгдөх вэ?',
'1. Хоол хийх эсвэл гадуур идэх дуртай юу? Яагаад?\n2. Улсынхаа ямар хоолыг санал болгох вэ?\n3. Гэрийн хоол рестораны хоолноос үргэлж эрүүл гэдэгтэй санал нийлэх үү?\n4. Ирээдүйд хүмүүсийн хооллох дадал хэрхэн өөрчлөгдөх вэ?',
'1. Өдөр бүр ашигладаг технологи юу вэ? Яаж тусалдаг вэ?\n2. Хүмүүс утсандаа хэт их цаг зарцуулж байна уу? Яагаад?\n3. Технологи биднийг нийгмийн харилцаанаас холдуулдаг гэдэгтэй санал нийлэх үү?\n4. Хиймэл оюун ирээдүйн ажилд хэрхэн нөлөөлөх вэ?',
'1. Сургуульд ямар хичээлд хамгийн дуртай байсан бэ? Яагаад?\n2. Өглөө эсвэл шөнө хичээллэх дуртай юу? Яагаад?\n3. Туршлагаас сурах нь номоос сурахаас дээр гэдэгтэй санал нийлэх үү?\n4. Тавин жилийн дараа сургууль ямар өөр байх вэ?',
'1. Чөлөөт цагаараа юу хийдэг вэ?\n2. Бага наснаас хойш хобби тань өөрчлөгдсөн үү? Яаж?\n3. Хобби цагийн гарз гэдэгтэй санал нийлэх үү?\n4. Ирээдүйд хүмүүс чөлөөт цагаа яаж өнгөрөөх вэ?',
]
SENTENCE_MN=[['Та яагаад хоцорсон бэ?','Багш юу гэж хэлсэн бэ?','Уулзалт хаана болох вэ?'],['Төслөө дуусгасан уу?','Тэр яагаад тийм шаргуу суралцаж байна вэ?','Тэр юу хийж байна вэ?'],['Миний түлхүүрийг харсан уу?','Үр дүн хэзээ гарах вэ?','Үдэшлэгт яагаад ирээгүй вэ?'],['Амралтын өдрөөр юу хийх вэ?','Музей эндээс хол уу?','Менежер юу шийдсэн бэ?'],['Тоглолт ямар байсан бэ?','Зам яагаад хаалттай вэ?','Юу хайж байна вэ?']]
SENTENCE_CHUNKS_MN = [
['because = учир нь; the bus = автобус; I was late = би хоцорсон; broke down = эвдэрсэн', 'to submit = хүлээлгэн өгөх; She told us = тэр бидэнд хэлсэн; by Friday = Баасан гараг гэхэд; the report = тайлан', 'is being held = зохион байгуулагдаж байна; The meeting = уулзалт; on the third floor = гуравдугаар давхарт; in room 302 = 302 тоот өрөөнд'],
['we finished it = бид үүнийг дуусгасан; before = өмнө; Yes = тийм; the deadline = эцсийн хугацаа', 'he wants = тэр хүсэж байна; Because = учир нь; to pass = тэнцэх; the exam = шалгалт', 'that she borrowed = түүний зээлсэн; She is reading = тэр уншиж байна; from the library = номын сангаас; the book = ном'],
['on the table = ширээн дээр; I think = миний бодлоор; you left them = чи тэднийг орхисон; in the kitchen = гал тогоонд', 'will be announced = зарлагдана; next week = ирэх долоо хоногт; The results = үр дүн; on Monday = Даваа гарагт', 'I had = надад байсан; Because = учир нь; for an exam = шалгалтад; to study = хичээллэх'],
['my grandparents = миний өвөө эмээ; I’m planning = би төлөвлөж байна; to visit = эргэж очих; in the countryside = хөдөө', 'a ten-minute walk = арван минутын алхалт; It’s only = ердөө; from the station = буудлаас; away = зайд', 'the meeting = уулзалтыг; He decided = тэр шийдсэн; until next week = ирэх долоо хоног хүртэл; to postpone = хойшлуулах'],
['I’ve ever = миний урьд өмнө; It was = энэ байсан; the best concert = хамгийн сайн тоглолт; been to = очиж үзсэн', 'because of = улмаас; The road = зам; an accident = осол; is closed = хаалттай', 'I gave you = би чамд өгсөн; I’m looking for = би хайж байна; the notes = тэмдэглэл; that = холбох төлөөний үг'],
]
SENTENCE_ANSWERS=[['I was late because the bus broke down.','She told us to submit the report by Friday.','The meeting is being held in room 302 on the third floor.'],['Yes, we finished it before the deadline.','Because he wants to pass the exam.','She is reading the book that she borrowed from the library.'],['I think you left them on the table in the kitchen.','The results will be announced on Monday next week.','Because I had to study for an exam.'],["I'm planning to visit my grandparents in the countryside.","It's only a ten-minute walk away from the station.",'He decided to postpone the meeting until next week.'],["It was the best concert I've ever been to.",'The road is closed because of an accident.',"I'm looking for the notes that I gave you."]]
tp=pages('TOEFL_2026_5_Mock_Tests_MN.pdf')
for n in range(5):
    sections={}
    body='\n'.join(tp[4+n*10:11+n*10])
    wordtext=body.split('Reading · Part 1: Complete the Words')[1].split('Reading · Part 2:')[0]
    wordtext=wordtext[wordtext.index('\n',wordtext.index('Унших'))+1:]
    # Keep only the English paragraph. Strip the parenthetical source answers.
    wordtext='\n'.join(line for line in wordtext.splitlines() if not re.search('[А-Яа-яӨөҮү]',line)).strip()
    words=list(re.finditer(r'(\w+_+)\s*\((\w+)\)',wordtext))
    assert len(words)>=4,(n,wordtext)
    passage=re.sub(r'\s*\(\w+\)','',wordtext)
    sections['reading']=[q(f'Complete the word “{m[1]}” in the passage. Write the whole word.',f'Эх доторх “{m[1]}” үгийг гүйцээ. Бүтэн үгийг англиар бичээрэй.','Reading',m[2]) for m in words]
    for item in sections['reading']:item['passage']=passage
    listening=body.split('Listening\n')[1].split('Writing\n')[0]
    groups=re.split(r'Listen (?:and Choose a Response|to a Conversation|to an Announcement|to an Academic Talk)\n[^\n]*\n',listening)[1:]
    assert len(groups)==4
    translations=[row.split('|') for row in TOEFL_LISTENING_MN[n].splitlines()]
    listeningQs=[]
    keybody='\n'.join(tp[11+n*10:13+n*10])
    listeningKey=keybody.split('Listening\n')[1].split('Writing —')[0]
    keys=re.findall(r'(?:Choose\s+\d|(?:Conv|Ann|Talk) Q\d)\n([ABCD])\n',listeningKey)
    assert len(keys)==8,(n,keys)
    for group,text in enumerate(groups):
        matches=list(re.finditer(r'Item \d \(Audio\):\s*|Q\d\.\s*',text))
        assert len(matches)==2,(n,group)
        passage=text[:matches[0].start()].strip() if group else ''
        for i,m in enumerate(matches):
            raw=text[m.end():matches[i+1].start() if i<1 else len(text)]
            chunks=re.split(r'\n\s*[ABCD]\s*\n',raw)
            assert len(chunks)==5,(n,group,raw)
            index=group*2+i
            mn=translations[index];assert len(mn)==5
            prompt=clean(chunks[0]).replace('Choose the best response:','').strip()
            if not group:prompt='Choose the best response: '+prompt
            item=q(prompt,mn[0],'Listening',ord(keys[index])-65,[bi(clean(a),b) for a,b in zip(chunks[1:],mn[1:])])
            item['passage']=passage
            listeningQs.append(item)
    sections['listening']=listeningQs
    writing=body.split('Writing\n')[1].split('Speaking\n')[0]
    builds=writing.split('Write an Email')[0]
    matches=list(re.finditer(r'(?m)^\d\. A: ',builds));assert len(matches)==3
    sections['writing']=[]
    for i,m in enumerate(matches):
        raw=clean(builds[m.end():matches[i+1].start() if i<2 else len(builds)])
        chunks=raw.split('Chunks:')[1]
        item=q('Build a sentence to answer: '+raw,'Өгүүлбэрийн хэсгүүдийг зөв дараалалд оруулж хариул: '+SENTENCE_MN[n][i]+'\n'+chunks,'Writing',SENTENCE_ANSWERS[n][i],kind='sentence')
        item['hint']=bi('Use every supplied chunk once, keeping the words within each chunk together.', 'Өгсөн хэсэг бүрийг нэг удаа ашиглаж, хэсэг доторх үгсийг салгахгүй. '+SENTENCE_CHUNKS_MN[n][i])
        # Natural alternative placements of the supplied adverbial chunks.
        alternatives={ (0,2):['The meeting is being held on the third floor in room 302.'], (2,0):['I think you left them in the kitchen on the table.'], (2,1):['The results will be announced next week on Monday.'] }
        item['accepted']=[item['answer'],*alternatives.get((n,i),[])]
        sections['writing'].append(item)
    for kind,start,end,mn,minimum in [('email','TASK · ДААЛГАВАР\n','Write for an Academic Discussion',TOEFL_EMAIL_MN[n],None),('discussion','Professor:',None,TOEFL_DISCUSSION_MN[n],100)]:
        text=writing.split(start,1)[1]
        if end:text=text.split(end)[0]
        prompt,model=text.split('Sample answer',1)
        model=re.split(r'SAMPLE \([^\n]+\)\n',model)[1].strip()
        if kind=='discussion':prompt='Professor: '+prompt
        item=q(clean(prompt),mn,'Writing',kind='essay',minWords=minimum)
        item['hint']=bi('Email · 7 minutes.' if kind=='email' else 'Academic discussion · 10 minutes · at least 100 words.','Имэйл · 7 минут.' if kind=='email' else 'Эрдэм шинжилгээний хэлэлцүүлэг · 10 минут · 100-аас доошгүй үг.')
        item['explanation']=bi('Compare with this sample response. Other well-supported answers are possible.\n\n'+model,'Загвар хариулттай харьцуул. Өөр үндэслэлтэй хариулт мөн зөв байж болно. Даалгаврыг бүрэн биелүүлсэн эсэх, бүтэц, дүрэм, үгийн сонголтоо шалга.\n\n'+model)
        sections['writing'].append(item)
    speaking=body.split('Speaking\n')[1]
    repeat,interview=speaking.split('Take an Interview',1)
    repeat=repeat[repeat.index('1. '):].strip()
    interview=interview[interview.index('1. '):].strip()
    sections['speaking']=[]
    for en,mn,kind in [(repeat,TOEFL_REPEAT_MN[n],'repeat'),(interview,TOEFL_INTERVIEW_MN[n],'interview')]:
        prompt=('Listen and repeat each sentence.\n' if kind=='repeat' else 'Answer each interview question aloud. Allow 45 seconds per answer.\n')+en
        item=q(prompt,('Өгүүлбэр бүрийг сонсоод давт.\n' if kind=='repeat' else 'Асуулт бүрд 45 секунд чангаар хариул.\n')+mn,'Speaking',kind='speaking')
        item['speechText']=en if kind=='repeat' else None
        item['explanation']=bi('Listen back. For repeat tasks, compare exact words, stress and pronunciation. For interview answers, check for a direct answer, a reason and a specific example.','Эргэн сонс. Давтах даалгаварт үг, өргөлт, дуудлагаа эхтэй харьцуул. Ярилцлагад шууд хариулт, шалтгаан, тодорхой жишээ оруулсан эсэхээ шалга.')
        sections['speaking'].append(item)
    sets[f'toefl-{n+1}']=sections
for key,sections in sets.items():
    for section,items in sections.items():
        for i,item in enumerate(items):item['id']=f'{section}-{i}'
(ROOT/'content/sections.json').write_text(json.dumps(sets,ensure_ascii=False,indent=2)+'\n')
print({key:{section:len(items) for section,items in sections.items()} for key,sections in sets.items()})
