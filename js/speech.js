// 발음 인식 (iPhone Safari: webkitSpeechRecognition — 받아쓰기 기능 사용)
// 인식이 안 되는 환경(홈 화면 앱 일부 버전 등)에서는 '스스로 체크' 방식으로 자동 전환
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canRecognize = !!SR;

export function listenOnce({ lang = "en-US", timeoutMs = 7000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error("unsupported"));
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 5;
    let done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(t); try { rec.stop(); } catch {} fn(v); };
    const t = setTimeout(() => finish(reject, new Error("no-speech")), timeoutMs);
    rec.onresult = (e) => {
      const alts = [];
      for (const r of e.results) for (let i = 0; i < r.length; i++) alts.push(r[i].transcript);
      finish(resolve, alts);
    };
    rec.onerror = (e) => finish(reject, new Error(e.error || "error"));
    rec.onend = () => finish(reject, new Error("no-speech"));
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
