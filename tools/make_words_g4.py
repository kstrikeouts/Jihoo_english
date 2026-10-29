"""4학년 단어장 생성기 — data/words_g4.json (Day 1~30, 하루 7개)
형식: (영어, 종류 w=단어 i=숙어, 뜻, 이모지, 예문, 예문 해석)
단어를 고치려면 이 파일을 고치고 `python tools/make_words_g4.py` 실행
"""
import json, re, sys
from pathlib import Path

DAYS = [
 ("아침 일과", [
  ("get up", "i", "(잠자리에서) 일어나다", "🌅", "I get up at seven.", "나는 7시에 일어나."),
  ("breakfast", "w", "아침 식사", "🥞", "I eat breakfast with my family.", "나는 가족과 아침을 먹어."),
  ("wash", "w", "씻다", "🧼", "Wash your hands.", "손을 씻어."),
  ("brush", "w", "(솔로) 닦다", "🪥", "I brush my teeth.", "나는 이를 닦아."),
  ("early", "w", "일찍", "🐓", "I go to bed early.", "나는 일찍 자."),
  ("late", "w", "늦은, 늦게", "😰", "Hurry up! You're late.", "서둘러! 너 늦었어."),
  ("go to school", "i", "학교에 가다", "🚸", "I go to school at eight.", "나는 8시에 학교에 가."),
 ]),
 ("시간", [
  ("time", "w", "시간", "⌚", "What time is it?", "몇 시야?"),
  ("clock", "w", "시계 (벽시계)", "🕰️", "Look at the clock.", "시계를 봐."),
  ("hour", "w", "1시간", "⏳", "I play games for an hour.", "나는 한 시간 동안 게임을 해."),
  ("minute", "w", "(시간의) 분", "⏱️", "Wait a minute, please.", "잠깐만 기다려 줘."),
  ("noon", "w", "정오, 낮 12시", "🕛", "We have lunch at noon.", "우리는 낮 12시에 점심을 먹어."),
  ("lunch", "w", "점심 식사", "🍱", "Lunch is ready!", "점심 준비됐어!"),
  ("go to bed", "i", "자러 가다", "🌙", "I go to bed at nine.", "나는 9시에 자러 가."),
 ]),
 ("요일 1", [
  ("Monday", "w", "월요일", "🌕", "I have piano class on Monday.", "나는 월요일에 피아노 수업이 있어."),
  ("Tuesday", "w", "화요일", "🔥", "See you on Tuesday.", "화요일에 보자."),
  ("Wednesday", "w", "수요일", "💧", "Today is Wednesday.", "오늘은 수요일이야."),
  ("Thursday", "w", "목요일", "🌳", "I swim on Thursday.", "나는 목요일에 수영을 해."),
  ("week", "w", "주, 일주일", "🗓️", "There are seven days in a week.", "일주일은 7일이야."),
  ("today", "w", "오늘", "📆", "What day is it today?", "오늘 무슨 요일이야?"),
  ("tomorrow", "w", "내일", "⏭️", "See you tomorrow.", "내일 봐."),
 ]),
 ("요일 2", [
  ("Friday", "w", "금요일", "🪙", "I love Friday.", "나는 금요일이 정말 좋아."),
  ("Saturday", "w", "토요일", "🪨", "Let's play on Saturday.", "토요일에 놀자."),
  ("Sunday", "w", "일요일", "☀️", "I go to church on Sunday.", "나는 일요일에 교회에 가."),
  ("weekend", "w", "주말", "🎡", "What do you do on the weekend?", "너는 주말에 뭐 해?"),
  ("yesterday", "w", "어제", "⏮️", "I was sick yesterday.", "나는 어제 아팠어."),
  ("every day", "i", "매일", "🔁", "I read books every day.", "나는 매일 책을 읽어."),
  ("after school", "i", "방과 후에", "🎒", "Let's play soccer after school.", "방과 후에 축구 하자."),
 ]),
 ("날씨", [
  ("weather", "w", "날씨", "🌦️", "How's the weather today?", "오늘 날씨 어때?"),
  ("cloudy", "w", "흐린, 구름 낀", "☁️", "It's cloudy today.", "오늘은 흐려."),
  ("windy", "w", "바람이 부는", "🌬️", "It's windy outside.", "밖에 바람이 불어."),
  ("snowy", "w", "눈이 오는", "❄️", "It's snowy. Let's make a snowman.", "눈이 와. 눈사람 만들자."),
  ("hot", "w", "더운, 뜨거운", "🥵", "It's hot in summer.", "여름에는 더워."),
  ("cold", "w", "추운, 차가운", "🥶", "It's cold. Wear your coat.", "추워. 코트 입어."),
  ("put on", "i", "(옷 등을) 입다, 쓰다", "🧥", "Put on your jacket.", "재킷을 입어."),
 ]),
 ("계절", [
  ("spring", "w", "봄", "🌸", "Flowers come out in spring.", "봄에는 꽃이 피어."),
  ("summer", "w", "여름", "🏖️", "I go to the beach in summer.", "나는 여름에 바닷가에 가."),
  ("fall", "w", "가을", "🍁", "Leaves turn red in fall.", "가을에는 나뭇잎이 빨개져."),
  ("winter", "w", "겨울", "⛄", "It snows in winter.", "겨울에는 눈이 와."),
  ("season", "w", "계절", "🍂", "What's your favorite season?", "네가 제일 좋아하는 계절은 뭐야?"),
  ("warm", "w", "따뜻한", "🌤️", "It's warm in spring.", "봄에는 따뜻해."),
  ("take off", "i", "(옷 등을) 벗다", "👞", "Take off your shoes, please.", "신발을 벗어 주세요."),
 ]),
 ("옷", [
  ("shirt", "w", "셔츠", "👕", "I like your shirt.", "네 셔츠 마음에 들어."),
  ("pants", "w", "바지", "👖", "My pants are too long.", "내 바지는 너무 길어."),
  ("skirt", "w", "치마", "👗", "She has a pink skirt.", "그녀는 분홍색 치마가 있어."),
  ("shoes", "w", "신발", "👟", "These are my new shoes.", "이건 내 새 신발이야."),
  ("hat", "w", "모자", "👒", "Wear a hat. It's sunny.", "모자 써. 햇볕이 강해."),
  ("socks", "w", "양말", "🧦", "Where are my socks?", "내 양말 어디 있어?"),
  ("gloves", "w", "장갑", "🧤", "Wear your gloves in winter.", "겨울에는 장갑을 껴."),
 ]),
 ("가게", [
  ("buy", "w", "사다", "🛒", "I want to buy a ball.", "나는 공을 사고 싶어."),
  ("sell", "w", "팔다", "🏷️", "They sell toys here.", "여기서 장난감을 팔아."),
  ("money", "w", "돈", "💰", "I don't have money.", "나는 돈이 없어."),
  ("store", "w", "가게", "🏪", "Let's go to the store.", "가게에 가자."),
  ("doll", "w", "인형", "🪆", "This doll is cute.", "이 인형은 귀여워."),
  ("how much", "i", "얼마", "💵", "How much is it?", "이거 얼마예요?"),
  ("try on", "i", "(시험 삼아) 입어 보다", "🪞", "Can I try on this hat?", "이 모자 써 봐도 돼요?"),
 ]),
 ("음식", [
  ("rice", "w", "밥, 쌀", "🍚", "I eat rice every day.", "나는 매일 밥을 먹어."),
  ("bread", "w", "빵", "🍞", "I want some bread.", "나는 빵을 좀 먹고 싶어."),
  ("soup", "w", "수프, 국", "🥣", "The soup is hot.", "국이 뜨거워."),
  ("noodles", "w", "국수, 면", "🍜", "I like noodles.", "나는 국수를 좋아해."),
  ("chicken", "w", "닭고기, 치킨", "🍗", "Let's eat chicken!", "치킨 먹자!"),
  ("vegetable", "w", "채소", "🥦", "Eat your vegetables.", "채소를 먹으렴."),
  ("fruit", "w", "과일", "🍇", "What fruit do you like?", "너는 무슨 과일을 좋아해?"),
 ]),
 ("식사", [
  ("delicious", "w", "아주 맛있는", "😋", "This pizza is delicious.", "이 피자 정말 맛있어."),
  ("sweet", "w", "달콤한", "🍭", "Candy is sweet.", "사탕은 달아."),
  ("full", "w", "배부른, 가득 찬", "😌", "I'm full. Thank you.", "배불러요. 고맙습니다."),
  ("thirsty", "w", "목마른", "🥤", "I'm thirsty. Can I have some water?", "목말라. 물 좀 줄래?"),
  ("water", "w", "물", "🚰", "Drink some water.", "물을 좀 마셔."),
  ("a lot of", "i", "많은", "🔢", "I have a lot of books.", "나는 책이 많아."),
  ("have dinner", "i", "저녁을 먹다", "🌆", "We have dinner at six.", "우리는 6시에 저녁을 먹어."),
 ]),
 ("동네 1", [
  ("park", "w", "공원", "⛲", "Let's go to the park.", "공원에 가자."),
  ("library", "w", "도서관", "📚", "I read books in the library.", "나는 도서관에서 책을 읽어."),
  ("hospital", "w", "병원", "🏥", "The hospital is big.", "그 병원은 커."),
  ("zoo", "w", "동물원", "🦓", "We saw lions at the zoo.", "우리는 동물원에서 사자를 봤어."),
  ("museum", "w", "박물관", "🏛️", "The museum is near my house.", "박물관은 우리 집 근처에 있어."),
  ("next to", "i", "~ 옆에", "👫", "The bank is next to the park.", "은행은 공원 옆에 있어."),
  ("across from", "i", "~ 맞은편에", "↔️", "The zoo is across from the museum.", "동물원은 박물관 맞은편에 있어."),
 ]),
 ("동네 2 (길 찾기)", [
  ("bank", "w", "은행", "🏦", "Where is the bank?", "은행이 어디에 있어?"),
  ("post office", "i", "우체국", "📮", "The post office is on Main Street.", "우체국은 메인가에 있어."),
  ("restaurant", "w", "식당", "🍴", "Let's eat at the restaurant.", "식당에서 먹자."),
  ("station", "w", "역", "🚉", "Go to the station.", "역으로 가."),
  ("street", "w", "거리, 길", "🛣️", "Look both ways on the street.", "길에서는 양쪽을 살펴."),
  ("turn left", "i", "왼쪽으로 돌다", "↩️", "Turn left at the bank.", "은행에서 왼쪽으로 돌아."),
  ("go straight", "i", "곧장 가다", "⬆️", "Go straight one block.", "한 블록 곧장 가."),
 ]),
 ("과목", [
  ("math", "w", "수학", "➗", "I like math.", "나는 수학을 좋아해."),
  ("science", "w", "과학", "🔬", "Science is fun.", "과학은 재미있어."),
  ("music", "w", "음악", "🎵", "We sing songs in music class.", "우리는 음악 시간에 노래를 불러."),
  ("art", "w", "미술", "🎨", "I draw pictures in art class.", "나는 미술 시간에 그림을 그려."),
  ("English", "w", "영어", "🔤", "I study English every day.", "나는 매일 영어를 공부해."),
  ("subject", "w", "과목", "📖", "What's your favorite subject?", "네가 제일 좋아하는 과목은 뭐야?"),
  ("be good at", "i", "~을 잘하다", "🏅", "I'm good at math.", "나는 수학을 잘해."),
 ]),
 ("학교", [
  ("classroom", "w", "교실", "🏫", "This is my classroom.", "여기가 우리 교실이야."),
  ("gym", "w", "체육관", "🤸", "Let's play in the gym.", "체육관에서 놀자."),
  ("playground", "w", "놀이터, 운동장", "🛝", "We play on the playground.", "우리는 운동장에서 놀아."),
  ("chair", "w", "의자", "🪑", "Sit on the chair.", "의자에 앉아."),
  ("teacher", "w", "선생님", "🧑‍🏫", "My teacher is kind.", "우리 선생님은 친절해."),
  ("student", "w", "학생", "🧑‍🎓", "I'm a student.", "나는 학생이야."),
  ("come in", "i", "들어오다", "🙋", "Come in, please.", "들어오세요."),
 ]),
 ("우리 집", [
  ("house", "w", "집, 주택", "🏡", "My house is small.", "우리 집은 작아."),
  ("bedroom", "w", "침실", "🛏️", "This is my bedroom.", "여기가 내 침실이야."),
  ("kitchen", "w", "부엌", "🍳", "Mom is in the kitchen.", "엄마는 부엌에 계셔."),
  ("bathroom", "w", "욕실, 화장실", "🛁", "Where is the bathroom?", "화장실이 어디야?"),
  ("living room", "i", "거실", "🛋️", "Dad is in the living room.", "아빠는 거실에 계셔."),
  ("window", "w", "창문", "🪟", "Open the window, please.", "창문 좀 열어 줘."),
  ("door", "w", "문", "🚪", "Close the door, please.", "문 좀 닫아 줘."),
 ]),
 ("위치", [
  ("in", "w", "~ 안에", "📥", "The cat is in the box.", "고양이는 상자 안에 있어."),
  ("on", "w", "~ 위에 (붙어서)", "🔝", "The book is on the desk.", "책은 책상 위에 있어."),
  ("under", "w", "~ 아래에", "⬇️", "The ball is under the bed.", "공은 침대 아래에 있어."),
  ("behind", "w", "~ 뒤에", "🫣", "The dog is behind the door.", "개는 문 뒤에 있어."),
  ("in front of", "i", "~ 앞에", "🧍", "I'm in front of the school.", "나는 학교 앞에 있어."),
  ("box", "w", "상자", "📦", "What's in the box?", "상자 안에 뭐가 있어?"),
  ("where", "w", "어디에", "📍", "Where is my bag?", "내 가방 어디 있어?"),
 ]),
 ("교통", [
  ("bus", "w", "버스", "🚌", "I take the bus to school.", "나는 버스를 타고 학교에 가."),
  ("car", "w", "자동차", "🚗", "My dad has a red car.", "우리 아빠는 빨간 차가 있어."),
  ("bike", "w", "자전거", "🚲", "I ride my bike in the park.", "나는 공원에서 자전거를 타."),
  ("train", "w", "기차", "🚆", "The train is fast.", "기차는 빨라."),
  ("airplane", "w", "비행기", "✈️", "I see an airplane in the sky.", "하늘에 비행기가 보여."),
  ("subway", "w", "지하철", "🚇", "We go downtown by subway.", "우리는 지하철로 시내에 가."),
  ("get on", "i", "(버스·기차 등에) 타다", "🚏", "Let's get on the bus.", "버스에 타자."),
 ]),
 ("직업", [
  ("doctor", "w", "의사", "🩺", "My aunt is a doctor.", "우리 이모는 의사야."),
  ("nurse", "w", "간호사", "👩‍⚕️", "The nurse is kind.", "그 간호사는 친절해."),
  ("cook", "w", "요리사, 요리하다", "🧑‍🍳", "My dad is a good cook.", "우리 아빠는 요리를 잘해."),
  ("farmer", "w", "농부", "🧑‍🌾", "The farmer grows apples.", "그 농부는 사과를 길러."),
  ("singer", "w", "가수", "🧑‍🎤", "She is a famous singer.", "그녀는 유명한 가수야."),
  ("pilot", "w", "비행기 조종사", "🧑‍✈️", "The pilot flies a plane.", "조종사는 비행기를 조종해."),
  ("want to be", "i", "~이 되고 싶다", "🌠", "I want to be a baseball player.", "나는 야구 선수가 되고 싶어."),
 ]),
 ("움직임", [
  ("run", "w", "달리다", "🏃", "I can run fast.", "나는 빨리 달릴 수 있어."),
  ("walk", "w", "걷다", "🚶", "Let's walk to the park.", "공원까지 걸어가자."),
  ("ride", "w", "(자전거·말 등을) 타다", "🏇", "Can you ride a horse?", "너 말 탈 수 있어?"),
  ("climb", "w", "오르다", "🧗", "I can climb a tree.", "나는 나무에 오를 수 있어."),
  ("throw", "w", "던지다", "🤾", "Throw the ball to me.", "나한테 공을 던져."),
  ("catch", "w", "잡다", "🥎", "Catch the ball!", "공 잡아!"),
  ("fly", "w", "날다, 날리다", "🪁", "Birds fly in the sky.", "새들이 하늘을 날아."),
 ]),
 ("운동·취미", [
  ("soccer", "w", "축구", "⚽", "Let's play soccer.", "축구 하자."),
  ("baseball", "w", "야구", "⚾", "I play baseball on the weekend.", "나는 주말에 야구를 해."),
  ("basketball", "w", "농구", "🏀", "He is good at basketball.", "그는 농구를 잘해."),
  ("badminton", "w", "배드민턴", "🏸", "Let's play badminton.", "배드민턴 치자."),
  ("hobby", "w", "취미", "🧩", "What's your hobby?", "네 취미는 뭐야?"),
  ("how about", "i", "~하는 게 어때?", "💡", "How about playing baseball?", "야구 하는 게 어때?"),
  ("go fishing", "i", "낚시하러 가다", "🎣", "Let's go fishing this Sunday.", "이번 일요일에 낚시하러 가자."),
 ]),
 ("기분", [
  ("angry", "w", "화난", "😠", "Are you angry?", "너 화났어?"),
  ("tired", "w", "피곤한", "😩", "I'm tired. I want to sleep.", "피곤해. 자고 싶어."),
  ("scared", "w", "무서워하는", "😱", "I'm scared of dogs.", "나는 개가 무서워."),
  ("excited", "w", "신이 난", "🤩", "I'm so excited!", "나 정말 신나!"),
  ("bored", "w", "지루해하는", "🥱", "I'm bored. Let's play.", "심심해. 놀자."),
  ("worried", "w", "걱정하는", "😟", "Don't be worried.", "걱정하지 마."),
  ("cheer up", "i", "기운 내다", "📣", "Cheer up! You can do it.", "힘내! 너는 할 수 있어."),
 ]),
 ("건강", [
  ("sick", "w", "아픈", "🤒", "I'm sick today.", "나는 오늘 아파."),
  ("hurt", "w", "아프다, 다치게 하다", "🤕", "My leg hurts.", "다리가 아파."),
  ("fever", "w", "열", "🌡️", "I have a fever.", "나 열이 나."),
  ("medicine", "w", "약", "💊", "Take this medicine.", "이 약을 먹으렴."),
  ("rest", "w", "쉬다, 휴식", "🛌", "Get some rest.", "좀 쉬어."),
  ("have a cold", "i", "감기에 걸리다", "🤧", "I have a cold.", "나 감기 걸렸어."),
  ("be careful", "i", "조심하다", "⚠️", "Be careful! The floor is wet.", "조심해! 바닥이 젖었어."),
 ]),
 ("몸", [
  ("arm", "w", "팔", "💪", "Raise your arms.", "팔을 들어."),
  ("leg", "w", "다리", "🦵", "A spider has eight legs.", "거미는 다리가 여덟 개야."),
  ("finger", "w", "손가락", "☝️", "I have ten fingers.", "나는 손가락이 열 개야."),
  ("tooth", "w", "이, 치아", "🦷", "I have a loose tooth.", "이가 흔들려."),
  ("ear", "w", "귀", "👂", "Rabbits have long ears.", "토끼는 귀가 길어."),
  ("mouth", "w", "입", "👄", "Open your mouth.", "입을 벌려."),
  ("shoulder", "w", "어깨", "🤷", "Touch your shoulders.", "어깨를 만져 봐."),
 ]),
 ("큰 숫자", [
  ("eleven", "w", "열하나, 11", "1️⃣1️⃣", "I'm eleven years old.", "나는 열한 살이야."),
  ("twelve", "w", "열둘, 12", "1️⃣2️⃣", "There are twelve months in a year.", "1년은 12달이야."),
  ("thirteen", "w", "열셋, 13", "1️⃣3️⃣", "I have thirteen pencils.", "나는 연필이 13자루 있어."),
  ("fifteen", "w", "열다섯, 15", "1️⃣5️⃣", "It's fifteen minutes to school.", "학교까지 15분 걸려."),
  ("twenty", "w", "스물, 20", "2️⃣0️⃣", "I can count to twenty.", "나는 20까지 셀 수 있어."),
  ("fifty", "w", "쉰, 50", "5️⃣0️⃣", "This book has fifty pages.", "이 책은 50쪽이야."),
  ("hundred", "w", "백, 100", "💯", "I got a hundred on the test!", "나 시험에서 100점 받았어!"),
 ]),
 ("모양·크기", [
  ("tall", "w", "키가 큰, 높은", "🦒", "My brother is tall.", "우리 형은 키가 커."),
  ("short", "w", "키가 작은, 짧은", "🐜", "My hair is short.", "내 머리는 짧아."),
  ("long", "w", "긴", "📏", "A giraffe has a long neck.", "기린은 목이 길어."),
  ("heavy", "w", "무거운", "🏋️", "This bag is heavy.", "이 가방은 무거워."),
  ("light", "w", "가벼운", "🪶", "A feather is light.", "깃털은 가벼워."),
  ("fast", "w", "빠른, 빨리", "🐆", "A cheetah is very fast.", "치타는 아주 빨라."),
  ("slow", "w", "느린", "🐌", "A snail is slow.", "달팽이는 느려."),
 ]),
 ("상태", [
  ("new", "w", "새로운", "✨", "I have a new bag.", "나는 새 가방이 있어."),
  ("old", "w", "오래된, 나이 든", "🏚️", "This house is very old.", "이 집은 아주 오래됐어."),
  ("clean", "w", "깨끗한", "🧽", "My room is clean.", "내 방은 깨끗해."),
  ("dirty", "w", "더러운", "🐷", "My shoes are dirty.", "내 신발이 더러워."),
  ("easy", "w", "쉬운", "👌", "This game is easy.", "이 게임은 쉬워."),
  ("hard", "w", "어려운, 딱딱한", "🧠", "The test was hard.", "시험이 어려웠어."),
  ("pretty", "w", "예쁜", "🌺", "What a pretty flower!", "정말 예쁜 꽃이다!"),
 ]),
 ("가족·친구", [
  ("grandmother", "w", "할머니", "👵", "My grandmother lives in Gwangju.", "우리 할머니는 광주에 사셔."),
  ("grandfather", "w", "할아버지", "👴", "My grandfather is seventy.", "우리 할아버지는 일흔 살이셔."),
  ("uncle", "w", "삼촌, 외삼촌", "🧔", "My uncle is funny.", "우리 삼촌은 재미있어."),
  ("aunt", "w", "이모, 고모", "👩‍🦰", "My aunt bought me a book.", "이모가 나에게 책을 사 주셨어."),
  ("cousin", "w", "사촌", "🧒", "My cousin is nine years old.", "내 사촌은 아홉 살이야."),
  ("family", "w", "가족", "👨‍👩‍👦", "I love my family.", "나는 우리 가족을 사랑해."),
  ("friend", "w", "친구", "🤝", "She is my best friend.", "그녀는 내 가장 친한 친구야."),
 ]),
 ("하는 일", [
  ("read", "w", "읽다", "📕", "I read a book before bed.", "나는 자기 전에 책을 읽어."),
  ("write", "w", "쓰다", "✍️", "Write your name here.", "여기에 이름을 써."),
  ("draw", "w", "그리다", "🖍️", "I like to draw animals.", "나는 동물 그리는 걸 좋아해."),
  ("clean up", "i", "청소하다, 치우다", "🧹", "Let's clean up the room.", "방을 치우자."),
  ("do homework", "i", "숙제하다", "📝", "I do homework after dinner.", "나는 저녁 먹고 숙제를 해."),
  ("watch TV", "i", "TV를 보다", "📺", "I watch TV on Sunday.", "나는 일요일에 TV를 봐."),
  ("listen to", "i", "~을 듣다", "🎧", "I listen to music.", "나는 음악을 들어."),
 ]),
 ("파티", [
  ("party", "w", "파티", "🎉", "Come to my party!", "내 파티에 와!"),
  ("birthday", "w", "생일", "🎂", "Happy birthday!", "생일 축하해!"),
  ("present", "w", "선물", "🎁", "This present is for you.", "이 선물은 너를 위한 거야."),
  ("invite", "w", "초대하다", "💌", "I want to invite you.", "나는 너를 초대하고 싶어."),
  ("together", "w", "함께", "🤗", "Let's play together.", "같이 놀자."),
  ("of course", "i", "물론이지", "👍", "Can you come? Of course!", "올 수 있어? 물론이지!"),
  ("have fun", "i", "즐겁게 보내다", "🥳", "Have fun at the party!", "파티에서 즐거운 시간 보내!"),
 ]),
 ("자연·동물", [
  ("elephant", "w", "코끼리", "🐘", "An elephant has a long nose.", "코끼리는 코가 길어."),
  ("bear", "w", "곰", "🐻", "The bear is sleeping.", "곰이 자고 있어."),
  ("duck", "w", "오리", "🦆", "The duck can swim.", "오리는 헤엄칠 수 있어."),
  ("snake", "w", "뱀", "🐍", "I'm scared of snakes.", "나는 뱀이 무서워."),
  ("sea", "w", "바다", "🌊", "The sea is blue.", "바다는 파래."),
  ("mountain", "w", "산", "⛰️", "Let's climb the mountain.", "산에 오르자."),
  ("river", "w", "강", "🏞️", "Fish live in the river.", "물고기는 강에 살아."),
 ]),
]

def main():
    words, seen_w, seen_e, seen_m = [], set(), {}, set()
    n = 0
    problems = []
    for d, (theme, items) in enumerate(DAYS, 1):
        if len(items) != 7: problems.append(f"Day {d}: {len(items)}개")
        for (w, t, m, e, ex, exko) in items:
            n += 1
            if w.lower() in seen_w: problems.append(f"중복 단어 {w}")
            if m in seen_m: problems.append(f"중복 뜻 {m}")
            if e in seen_e: problems.append(f"중복 이모지 {e}: {w} / {seen_e[e]}")
            first = re.match(r"^[^.?!]+[.?!]", ex).group(0).lower()
            key = w.lower().replace("be good at", "good at").replace("want to be", "want to be")
            if key.split()[0] not in ex.lower(): problems.append(f"예문에 단어 없음: {w} / {ex}")
            seen_w.add(w.lower()); seen_m.add(m); seen_e[e] = w
            words.append({"id": f"g4-{n:04d}", "day": d, "word": w, "type": "idiom" if t == "i" else "word",
                          "meaning": m, "theme": theme, "emoji": e, "example": ex, "example_ko": exko,
                          "publishers": None})
    if problems:
        print("\n".join(problems)); sys.exit(1)
    out = Path(__file__).resolve().parent.parent / "data" / "words_g4.json"
    out.write_text(json.dumps({"version": 1, "level": "g4", "title": "4학년 단어·숙어", "per_day": 7,
        "source": "4학년 교과서 공통 주제(일과·시간·요일·날씨·옷·가게·음식·장소·길찾기·과목·학교·집·위치·교통·직업·동작·운동·기분·건강·몸·숫자·묘사·가족·파티·자연) 기준 선정. 출판사별 빈도 분석은 미적용(publishers=null).",
        "words": words}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(words)}개, {len(DAYS)}일 → {out}")

if __name__ == "__main__":
    main()
