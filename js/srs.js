// 라이트너 6칸 상자 + 공용 날짜/통계 유틸
export const INTERVALS = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30, 6: 60 };
export const GRAD_BOX = 7;
export const BOX_LABEL = { 1: "상자 1", 2: "상자 2", 3: "상자 3", 4: "상자 4", 5: "상자 5", 6: "상자 6", 7: "졸업" };

const KST = 9 * 3600e3;
export const nowISO = () => new Date().toISOString();
export function todayKST(offsetDays = 0) {
  return new Date(Date.now() + KST + offsetDays * 864e5).toISOString().slice(0, 10);
}
export function kstDate(iso) {
  return new Date(new Date(iso).getTime() + KST).toISOString().slice(0, 10);
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 화면/음성에서 읽을 문장: "I like ___." 같은 빈칸 표현은 예문 첫 문장으로 대체
export function spoken(w) {
  if (!w.word.includes("___")) return w.word;
  const m = w.example.match(/^[^.?!]+[.?!]/);
  return m ? m[0] : w.example;
}

export function newProgress(learnerId, wordId) {
  return {
    learner_id: learnerId, word_id: wordId, box: 1,
    next_due: todayKST(1), correct_count: 0, wrong_count: 0,
    first_learned_at: nowISO(), last_reviewed_at: null, graduated_at: null,
  };
}

// result: 'correct' | 'hint' | 'wrong'
export function applyResult(p, result) {
  const before = p.box;
  let box = before;
  if (result === "correct") box = Math.min(GRAD_BOX, before + 1);
  else if (result === "hint") box = Math.max(1, before - 1);
  else box = 1;
  const today = todayKST();
  return {
    ...p,
    box,
    next_due: box === GRAD_BOX ? addDays(today, 90) : addDays(today, INTERVALS[box]),
    correct_count: p.correct_count + (result === "wrong" ? 0 : 1),
    wrong_count: p.wrong_count + (result === "wrong" ? 1 : 0),
    last_reviewed_at: nowISO(),
    graduated_at: box === GRAD_BOX ? (p.graduated_at || nowISO()) : null,
  };
}

export function dueList(progressMap, cap) {
  const today = todayKST();
  return Object.values(progressMap)
    .filter((p) => p.box < GRAD_BOX && p.next_due <= today)
    .sort((a, b) => (a.next_due < b.next_due ? -1 : a.next_due > b.next_due ? 1 : a.box - b.box))
    .slice(0, cap);
}

export function learnedOn(progressMap, date) {
  return Object.values(progressMap).filter((p) => kstDate(p.first_learned_at) === date);
}

export function nextNewWords(words, progressMap, n) {
  return words.filter((w) => !progressMap[w.word_id ?? w.id]).slice(0, Math.max(0, n));
}

// 학습한 날: 학습/복습 활동이 있거나 듣기 5분 이상
export function studyDates(sessions) {
  const map = {};
  for (const s of sessions) {
    const d = kstDate(s.started_at);
    map[d] = map[d] || { xp: 0, active: 0, audio: 0, seconds: 0 };
    map[d].xp += s.xp || 0;
    map[d].active += (s.new_words || 0) + (s.reviewed_words || 0);
    map[d].audio += s.audio_seconds || 0;
    if (s.ended_at) map[d].seconds += Math.max(0, (new Date(s.ended_at) - new Date(s.started_at)) / 1000);
  }
  return map;
}
export const countsAsStudy = (day) => !!day && (day.active > 0 || day.audio >= 300);

// 연속 학습일 — 일주일(월~일)에 하루는 '쉬는 날 방패'로 끊기지 않음
export function streak(dayMap) {
  let count = 0;
  const usedShield = new Set();
  let d = todayKST();
  if (!countsAsStudy(dayMap[d])) d = addDays(d, -1); // 오늘 아직 안 했으면 어제부터
  for (let i = 0; i < 1000; i++) {
    if (countsAsStudy(dayMap[d])) { count++; d = addDays(d, -1); continue; }
    const wk = weekKey(d);
    if (count > 0 && !usedShield.has(wk) && countsAsStudy(dayMap[addDays(d, -1)])) {
      usedShield.add(wk); d = addDays(d, -1); continue;
    }
    break;
  }
  return count;
}
function weekKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7; // 월=0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export const levelOf = (xp) => Math.floor(xp / 200) + 1;
export const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
export const uuid = () =>
  crypto.randomUUID ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));

// ── 학습 일정: 학습 5일 → 복습 Day 1일 반복 ─────────────────
// 단어장의 day(1~30, 7개씩) = 단원. 일정의 Day 번호는 복습 Day 를 포함해 1~36.
//   Day 1~5 학습 → Day 6 복습(1~5 단어 반복 학습 + 테스트) → Day 7~11 학습 → Day 12 복습 …
export const LEARN_PER_CYCLE = 5;
export function buildSchedule(words, every = LEARN_PER_CYCLE) {
  const units = [...new Set(words.map((w) => w.day))].filter(Boolean).sort((a, b) => a - b);
  const out = [];
  let pend = [];
  const addReview = () => {
    const covers = pend.map((p) => p.n);
    const unitSet = new Set(pend.map((p) => p.unit));
    out.push({ n: out.length + 1, kind: "review", covers, theme: `Day ${covers[0]}~${covers[covers.length - 1]} 복습`,
      words: words.filter((w) => unitSet.has(w.day)) });
    pend = [];
  };
  for (const u of units) {
    const ws = words.filter((w) => w.day === u);
    const item = { n: out.length + 1, kind: "learn", unit: u, theme: ws[0]?.theme || "", words: ws };
    out.push(item); pend.push(item);
    if (pend.length === every) addReview();
  }
  if (pend.length) addReview();
  return out;
}
