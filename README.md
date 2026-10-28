# 지후 English 🦊

초등 3학년 2학기 ~ 6학년용 영어 단어·표현 자가 학습 웹앱 (아이폰 기준)
GitHub Pages(앱·단어·음성) + Supabase(학습 기록) 구조

## 폴더 구조

```
index.html            지후용 앱 (오늘 학습 / 🎧 듣기 / 단어장 / 보상)
parent.html           부모 대시보드
css/style.css
js/config.js          ★ Supabase 주소·키 입력하는 곳
js/app.js             학습 흐름 (복습 → 새 단어 5개 → 말하기 미션)
js/srs.js             복습 엔진 (라이트너 6칸 상자 1·3·7·14·30·60일)
js/db.js              Supabase 연동 + 오프라인 전송 대기열
js/audio.js           음성 재생 + 듣기 반복 모드 (잠금화면 재생)
js/speech.js          발음 인식 채점
js/parent.js          부모 대시보드
data/words_g34.json   3~4학년 단어장 (지금은 시작용 70개)
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

## 🎧 듣기 모드 (버스·지하철)
- 음성 MP3 가 준비되면 **화면을 꺼도 계속 재생**되고 잠금화면에서 ⏯ ⏭ 조작 가능
- **📥 지하철용 미리 저장** 을 눌러 두면 인터넷이 끊겨도 재생
- 순서: `영어 → 뜻` (익숙해지기) / `뜻 → 2초 → 영어` (떠올리기, 기억 효과 ↑)
- 자동 끄기 10·20·30분
- ⚠️ 홈 화면 앱에서 잠금 시 소리가 멈추면 **Safari 에서 열어** 듣기 모드를 쓰세요 (iOS 버전에 따라 다름)
- 듣기는 복습 상자를 움직이지 않고 **듣기 시간만 기록**됩니다

## 단어 추가·수정
1. `data/words_g34.json` 에 같은 형식으로 추가 (id 는 겹치지 않게)
2. GitHub 에 올리면 Actions 가 **새 단어 음성만** 만들어 자동 배포
3. 5학년용은 `data/words_g56.json` 을 만들고 `js/config.js` 의 `WORD_FILES` 와 `sw.js` 의 `SHELL_FILES` 에 추가

단어 항목 형식:
```json
{ "id": "g34-0071", "word": "zebra", "type": "word", "meaning": "얼룩말", "theme": "animal",
  "emoji": "🦓", "example": "I see a zebra.", "example_ko": "얼룩말이 보여.",
  "pattern": "I see a ___.", "publishers": 4 }
```
- `type`: `word` 단어 / `chunk` 표현 / `idiom` 숙어
- `publishers`: 등장한 출판사 수 (교집합 분석 후 입력, 높을수록 먼저 배치)

## 앱 파일을 고친 뒤
`sw.js` 첫 줄의 `VERSION` 숫자를 올려야(예: `je-v2`) 아이 폰에 새 버전이 반영됩니다.
