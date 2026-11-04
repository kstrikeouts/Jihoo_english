// 발음 인식 (iPhone Safari: webkitSpeechRecognition — 받아쓰기 기능 사용)
// 인식이 안 되는 환경(홈 화면 앱 일부 버전 등)에서는 '스스로 체크' 방식으로 자동 전환
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canRecognize = !!SR;

// onInterim(text): 말하는 도중 중간 인식 결과 (노래방 자막처럼 글자 색칠에 사용)
// ctrl.stop(): 말하기를 끝냈다고 알림 (지금까지 들린 말로 판정)
export function listenOnce({ lang = "en-US", timeoutMs = 7000, onInterim = null, ctrl = null } = {}) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error("unsupported"));
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = !!onInterim;
    rec.continuous = false;
    rec.maxAlternatives = 5;
    let done = false, lastInterim = "";
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(t); try { rec.abort(); } catch { try { rec.stop(); } catch {} } fn(v); };
    if (ctrl) ctrl.stop = () => (lastInterim ? finish(resolve, [lastInterim]) : finish(reject, new Error("no-speech")));
    const t = setTimeout(() => (lastInterim ? finish(resolve, [lastInterim]) : finish(reject, new Error("no-speech"))), timeoutMs);
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      if (onInterim && !last.isFinal) {
        let text = "";
        for (const r of e.results) text += r[0].transcript;
        lastInterim = text;
        try { onInterim(text); } catch {}
        return;
      }
      const alts = [];
      for (const r of e.results) for (let i = 0; i < r.length; i++) alts.push(r[i].transcript);
      finish(resolve, alts);
    };
    rec.onerror = (e) => finish(reject, new Error(e.error || "error"));
    // 중간 결과만 오고 끝난 경우(일부 기기)도 그 결과로 판정
    rec.onend = () => (lastInterim ? finish(resolve, [lastInterim]) : finish(reject, new Error("no-speech")));
    try { rec.start(); } catch (e) { finish(reject, e); }
  });
}

// 숫자·동음이의어를 같은 말로 취급 (예: "2" / "to" / "too" → two)
const CANON = {
  "1": "one", won: "one", "2": "two", to: "two", too: "two", "3": "three", "4": "four", for: "four",
  "5": "five", "6": "six", "7": "seven", "8": "eight", ate: "eight", "9": "nine", "10": "ten",
  i: "eye", eyes: "eye", hi: "hello", bye: "goodbye", "goodbye.": "goodbye", mum: "mom", mommy: "mom", daddy: "dad",
};
// 줄임말은 풀어서 비교 (I'm = I am)
const EXPAND = [[/\bi'm\b/g, "i am"], [/\b(it|what|how|that|there|he|she|where|who)'s\b/g, "$1 is"], [/\blet's\b/g, "let us"],
  [/\b(you|we|they)'re\b/g, "$1 are"], [/\bcan't\b/g, "can not"], [/\bcannot\b/g, "can not"], [/\bdon't\b/g, "do not"],
  [/\bdoesn't\b/g, "does not"], [/\bisn't\b/g, "is not"], [/\b(i|you|we|they)'ll\b/g, "$1 will"]];
export function normalize(s) {
  let t = s.toLowerCase().replace(/[’']/g, "'");
  for (const [re, to] of EXPAND) t = t.replace(re, to);
  return t.replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/).filter(Boolean).map((w) => CANON[w] || w).join(" ");
}
function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// 별점 0~3 (격려용 근사치 — 아이 발음은 기계 인식이 완벽하지 않음)
export function scoreSpeech(target, alternatives) {
  const t = normalize(target);
  let best = { score: 0, transcript: alternatives[0] || "", sim: 0 };
  for (const alt of alternatives) {
    const a = normalize(alt);
    if (!a) continue;
    let sim = 1 - lev(a, t) / Math.max(a.length, t.length);
    if ((" " + a + " ").includes(" " + t + " ")) sim = 1; // 목표 표현을 포함하면 정답
    if (sim > best.sim) best = { transcript: alt, sim };
  }
  best.score = best.sim >= 0.85 ? 3 : best.sim >= 0.6 ? 2 : best.sim >= 0.35 ? 1 : 0;
  return best;
}

// 문장 말하기 테스트: 핵심 단어가 모두 들리고, 문장 전체가 80% 이상 일치해야 통과
export function scoreSentence(target, alternatives, keyWords) {
  const t = normalize(target);
  const keys = keyWords.map(normalize).filter(Boolean);
  let best = { pass: false, sim: 0, transcript: alternatives[0] || "", missing: keys };
  for (const alt of alternatives) {
    const a = normalize(alt);
    if (!a) continue;
    const words = a.split(" ");
    const missing = keys.filter((k) => !k.split(" ").every((x) => words.includes(x)));
    const sim = 1 - lev(a, t) / Math.max(a.length, t.length);
    const pass = !missing.length && sim >= 0.8;
    if (pass > best.pass || (pass === best.pass && sim > best.sim)) best = { pass, sim, transcript: alt, missing };
  }
  best.score = best.pass ? 3 : best.sim >= 0.6 ? 2 : best.sim >= 0.35 ? 1 : 0;
  return best;
}

// 노래방 자막: 목표 문장의 단어 중 지금까지 순서대로 들린 단어 개수와 각 단어의 맞음 여부
export function karaokeMatch(target, heard) {
  const tw = target.split(/\s+/).filter(Boolean).map((x) => normalize(x));
  const hw = normalize(heard).split(" ").filter(Boolean);
  const hit = tw.map(() => false);
  let j = 0, last = -1;
  tw.forEach((t, i) => {
    if (!t) { hit[i] = true; return; }
    const parts = t.split(" ");
    for (let k = j; k < hw.length; k++) {
      if (parts.every((p, n) => hw[k + n] === p || (hw[k + n] && lev(hw[k + n], p) <= (p.length > 4 ? 1 : 0)))) {
        hit[i] = true; j = k + parts.length; last = i; break;
      }
    }
  });
  return { hit, reached: last + 1 };
}

// ── 엄격 판정 (따라 말하기 · 문장 말하기) ──
// 받아쓰기의 "첫 번째 결과"만 사용 (예비 후보 중 하나라도 맞으면 통과시키던 방식은 너무 관대함)
// 단어 단위로 비교: 짧은 표현은 틀린 단어 0개, 6단어 이상 문장은 앞뒤 군더더기 없이 1개까지만 허용
function wordLev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
export function strictJudge(target, alternatives, keyWords = []) {
  const heard = alternatives[0] || "";
  const t = normalize(target).split(" ").filter(Boolean);
  let h = normalize(heard).split(" ").filter(Boolean);
  // 앞뒤에 붙은 군소리(uh, um, the 등)는 한 단어까지 봐줌 — 목표 표현이 그대로 들어 있을 때만
  const joined = " " + h.join(" ") + " ", tj = " " + t.join(" ") + " ";
  if (h.length === t.length + 1 && joined.includes(tj)) h = t.slice();
  const errors = wordLev(h, t);
  const allow = t.length >= 6 ? 1 : 0;
  const keys = keyWords.map(normalize).filter(Boolean);
  const missing = keys.filter((k) => !k.split(" ").every((x) => h.includes(x)));
  const pass = h.length > 0 && errors <= allow && !missing.length;
  const sim = t.length ? Math.max(0, 1 - errors / Math.max(t.length, h.length)) : 0;
  const score = pass ? 3 : sim >= 0.6 ? 2 : sim > 0 ? 1 : 0;
  // 틀린 단어 표시용
  const wrong = t.filter((x) => !h.includes(x));
  return { pass, score, transcript: heard, errors, missing, wrong };
}

// ── 완화된 판정 (2026-11 조정) ──
// · 받아쓰기 후보 상위 3개 중 하나라도 맞으면 인정
// · 단어/짧은 표현: 철자 기준 70% 이상 비슷하면 통과 ("break fast" → breakfast ○)
// · 문장: 단어의 70% 이상이 순서대로 들리고(비슷한 단어도 인정), 오늘 배운 단어(핵심어)가 들리면 통과
const near = (a, b) => a === b || (a && b && lev(a, b) <= (b.length >= 7 ? 2 : b.length >= 3 ? 1 : 0));
function inOrderHits(t, h) {
  let j = 0, hits = 0;
  for (const tw of t) {
    for (let k = j; k < h.length; k++) {
      if (near(h[k], tw)) { hits++; j = k + 1; break; }
      if (k + 1 < h.length && near(h[k] + h[k + 1], tw)) { hits++; j = k + 2; break; } // "break fast" = breakfast
    }
  }
  return hits;
}
export function relaxedJudge(target, alternatives, keyWords = []) {
  const t = normalize(target).split(" ").filter(Boolean);
  const keys = keyWords.map(normalize).filter(Boolean);
  const short = t.length <= 2;
  let best = null;
  for (const alt of alternatives.slice(0, 3)) {
    const hs = normalize(alt), h = hs.split(" ").filter(Boolean);
    if (!h.length) continue;
    const ts = t.join(" ");
    const charSim = 1 - lev(hs, ts) / Math.max(hs.length, ts.length);
    const hits = inOrderHits(t, h);
    const ratio = t.length ? hits / t.length : 0;
    const contains = (" " + hs + " ").includes(" " + ts + " ");
    // 핵심어: 붙여 쓴 형태("break fast")도 인정
    const flat = h.join("");
    const missing = keys.filter((k) => !(k.split(" ").every((x) => h.some((y) => near(y, x))) || flat.includes(k.replace(/ /g, ""))));
    const pass = short ? (contains || charSim >= 0.7 || ratio === 1) : (ratio >= 0.7 && !missing.length);
    const sim = short ? Math.max(charSim, contains ? 1 : 0) : ratio;
    const cand = { pass, sim, transcript: alt, missing, wrong: t.filter((x) => !h.some((y) => near(y, x))) };
    if (!best || (cand.pass && !best.pass) || (cand.pass === best.pass && cand.sim > best.sim)) best = cand;
  }
  if (!best) return { pass: false, score: 0, transcript: alternatives[0] || "", missing: keys, wrong: t };
  best.score = best.pass ? 3 : best.sim >= 0.5 ? 2 : best.sim > 0 ? 1 : 0;
  return best;
}
