# 지후 영단어

초등학교 3~6학년 필수 영단어를 학습, 복습, 테스트하며 진도를 관리하는 개인용 웹사이트입니다.

## 주요 기능

- **📖 학습**: 학년별 새 단어를 플래시카드로 학습 (영단어 → 뜻/예문/발음)
- **🔁 복습**: Leitner 박스 기반 간격 반복(SRS)으로 복습이 필요한 단어를 자동으로 모아 보여줌
- **📝 테스트**: 학습한 단어를 4지선다 퀴즈로 확인하고 결과를 기록
- **🏠 홈(대시보드)**: 학년별 진도율, 정답률, 최근 테스트 기록 확인
- 🔊 브라우저 음성 합성(Web Speech API)으로 단어 발음 듣기

## 기술 스택

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + SQLite (로컬 파일 기반 DB)

## 시작하기

```bash
npm install          # 의존성 설치 (Prisma Client 자동 생성)
cp .env.example .env # DATABASE_URL 설정
npm run db:migrate   # DB 스키마 생성
npm run db:seed      # 초등 필수 영단어 400개 시드 데이터 삽입
npm run dev          # 개발 서버 실행
```

[http://localhost:3000](http://localhost:3000) 에서 확인할 수 있습니다.

## 단어 데이터

`prisma/wordData.ts`에 학년별(3~6학년, 각 100단어) 필수 영단어가 카테고리와 함께 정리되어 있습니다.
단어를 추가/수정한 뒤 `npm run db:seed`를 다시 실행하면 DB에 반영됩니다.

## 학습 진도 로직 (SRS)

`src/lib/srs.ts`에 정의된 Leitner 박스(0~5단계) 방식입니다.

- 새 단어를 학습할 때 맞히면 박스가 올라가고, 틀리면 1단계로 초기화됩니다.
- 박스 단계에 따라 다음 복습 시점(1일 → 2일 → 4일 → 7일 → 15일)이 정해집니다.
- 복습 페이지는 복습 시점이 지난 단어를 오답 횟수가 많은 순서로 우선 보여줍니다.
