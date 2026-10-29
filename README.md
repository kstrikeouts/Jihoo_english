# 지후 English 🦊

초등 3학년 2학기 ~ 6학년용 영어 단어·표현 자가 학습 웹앱 (아이폰 기준)
GitHub Pages(앱·단어·음성) + Supabase(학습 기록) 구조

## 폴더 구조

```
index.html            지후용 앱 (오늘 학습 / 🎧 듣기 / 단어장 / 보상)
parent.html           부모 대시보드
css/style.css
js/config.js          ★ Supabase 주소·키 입력하는 곳
js/app.js             학습 흐름 (복습 → Day 단어 7개 반복 학습 → 테스트 통과)
js/celebrate.js       테스트 통과 칭찬 씬
js/srs.js             복습 엔진 (라이트너 6칸 상자 1·3·7·14·30·60일)
js/db.js              Supabase 연동 + 오프라인 전송 대기열
js/audio.js           음성 재생 + 듣기 반복 모드 (잠금화면 재생)
js/speech.js          발음 인식 채점
js/parent.js          부모 대시보드
data/words_g4.json    4학년 단어·숙어 210개 (학습 Day 30 + 복습 Day 6 = Day 1~36)
data/words_g5.json    5학년 210개 (Day 37~72)
data/words_g6.json    6학년 210개 (Day 73~108)
data/source/kice_2022_elementary.txt  교육과정 초등 권장 어휘 목록(800개, * 표시) — 단어 선정 기준
tools/check_kice.py  단어장이 초등 권장 어휘 안에 있는지 검사
tools/make_words_g4~6.py 학년별 단어장 원본 — 고친 뒤 실행하면 words_gN.json 이 다시 만들어짐 (중복·교육과정 어휘 자동 검사)
audio/                음성 MP3 (GitHub Actions 가 자동 생성 — 직접 넣지 않음)
tools/build_audio.py  음성 생성 스크립트
supabase/schema.sql   DB 테이블·보안 정책
sw.js, manifest.json  오프라인 지원, 홈 화면 앱 설치
```

## 설치 순서 (약 20분)

### 1. Supabase
1. supabase.com → New project (지역: Northeast Asia (Seoul))
2. 왼쪽 **SQL Editor** → `supabase/schema.sql` 내용 전체 붙여넣기 → **Run**
3. **Authentication → Users → Add user → Create new user**
   이메일·비밀번호 입력, **Auto Confirm User 체크** → 이 계정 하나로 지후 폰과 부모 폰 모두 로그인
4. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키 복사

### 2. config.js
`js/config.js` 의 두 줄을 채웁니다.
```js
SUPABASE_URL: "https://xxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",
```
> anon 키는 공개돼도 괜찮은 키입니다. 데이터는 RLS(로그인한 계정만 접근) 정책으로 보호됩니다.
> 비워 두면 **체험 모드**(그 폰에만 저장)로 동작하니 먼저 체험해 봐도 됩니다.

### 3. GitHub
1. 저장소: `kstrikeouts/Jihoo_english` (Public)
2. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**
3. 주소: `https://kstrikeouts.github.io/Jihoo_english/` (올린 뒤 1~2분 후 반영)
4. **Actions** 탭의 `build-audio` 가 단어장이 바뀔 때마다 음성 MP3 를 자동으로 만들어 커밋합니다
   - 첫 실행 때 단어 70개 × 5개 = 음성 350개 (몇 분 소요)

### 4. 지후 아이폰
1. **Safari** 로 주소 접속 → 부모 계정으로 한 번 로그인
2. 공유 버튼 → **홈 화면에 추가**
3. 발음 채점을 쓰려면: 설정 → 일반 → 키보드 → **받아쓰기 활성화** 켜기
   (꺼져 있으면 '스스로 체크' 방식으로 자동 전환됩니다)
4. 부모 화면(보상 탭 맨 아래 링크)에서 **비밀번호 4자리** 설정 권장

### 5. 부모 폰
같은 주소 뒤에 `parent.html` → 같은 계정으로 로그인 → 홈 화면에 추가

## 음성
- 영어: 성인 남성 표준 미국 발음(Guy), 한국어: 성인 남성(InJoon) — `tools/build_audio.py` 에서 변경
- 모든 음성 앞에 0.5초 무음을 넣어 첫소리가 잘리지 않게 함

## 🎧 듣기 모드 (버스·지하철)
- 음성 MP3 가 준비되면 **화면을 꺼도 계속 재생**되고 잠금화면에서 ⏯ ⏭ 조작 가능
- **📥 지하철용 미리 저장** 을 눌러 두면 인터넷이 끊겨도 재생
- 순서: `영어 → 뜻` (익숙해지기) / `뜻 → 2초 → 영어` (떠올리기, 기억 효과 ↑)
- 자동 끄기 10·20·30분
- ⚠️ 홈 화면 앱에서 잠금 시 소리가 멈추면 **Safari 에서 열어** 듣기 모드를 쓰세요 (iOS 버전에 따라 다름)
- 듣기는 복습 상자를 움직이지 않고 **듣기 시간만 기록**됩니다

## 학습 일정 (Day 1~108 = 4·5·6학년, 학년마다 36일)
**학습 Day 5일 → 복습 Day 1일**을 반복합니다. (Day 6·12·18·24·30·36 = 🌟 복습 Day)

### 학습 Day (하루 7개)
1. **어제 단어 복습** — 전날 배운 Day 단어 7개 + 복습 날짜가 된 단어를 한 문제씩 빠르게 확인 (Day 2부터)
2. **오늘 단어 7개 반복 학습** — 카드로 만나기 → 듣고 고르기 → 뜻 보고 고르기 → 스펠링. 틀리거나 힌트를 쓰면 조금 뒤 다시 나와 모두 맞힐 때까지 반복
3. **테스트** — 1부 4지선다 7문제 + 2부 스펠링 7문제 (힌트 없음, 스펠링은 가짜 알파벳 2개 섞임) + 3부 문장 말하기 3문제 (단어가 들어간 문장을 읽어 음성이 일치해야 통과, 복습 Day는 5문제). 모두 맞히면 통과 → 칭찬 씬 🎉, 틀린 문제는 그 문제만 다시 도전

### 복습 Day (6일째마다)
1. **반복 학습** — 지난 5일 단어 35개를 한 문제씩 (틀린 단어는 맞힐 때까지 다시)
2. **복습 테스트** — 4지선다 10 + 스펠링 10, 자주 틀린 단어 위주. 모두 맞히면 통과 → 복습 칭찬 씬 🌟

통과하지 못한 Day 는 다음 날 그대로 이어서 합니다.

## 단어 추가·수정
1. `tools/make_words_g4.py` 의 목록을 고치고 `python tools/make_words_g4.py` 실행 (중복·형식 자동 검사)
2. GitHub 에 올리면 Actions 가 **새 단어 음성만** 만들어 커밋
3. 5학년용은 같은 방식으로 `data/words_g5.json` 을 만들고 `js/config.js` 의 `WORD_FILES` 와 `sw.js` 의 `SHELL_FILES` 에 추가

## 앱 파일을 고친 뒤
`sw.js` 첫 줄의 `VERSION` 숫자를 올려야(예: `je-v2`) 아이 폰에 새 버전이 반영됩니다.
