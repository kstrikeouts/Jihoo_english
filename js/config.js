// ─────────────────────────────────────────────────────────────
// 지후 English 설정 파일 — 여기 두 줄만 채우면 Supabase 와 연결됩니다.
// Supabase 대시보드 > Project Settings > API 에서 복사
// 비워 두면 "체험 모드"(이 폰에만 저장)로 동작합니다.
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  SUPABASE_URL: "",       // 예: "https://abcdefgh.supabase.co"
  SUPABASE_ANON_KEY: "",  // anon public 키 (공개돼도 되는 키. 데이터는 RLS 로 보호)

  LEARNER_NAME: "정지후",
  DEFAULT_GRADE: 3,
  DAILY_NEW: 5,           // 하루 새 단어 수 (부모 화면에서 변경 가능)
  REVIEW_CAP: 20,         // 하루 최대 복습 카드 수
  WORD_FILES: ["data/words_g34.json"],  // 5학년이 되면 "data/words_g56.json" 추가
};
