// 음성 재생
// 1순위: GitHub Actions 가 만든 MP3 → 화면을 꺼도(잠금화면) 계속 재생, 잠금화면 버튼 지원
// 2순위: 아이폰 내장 음성(TTS) → MP3 가 아직 없을 때. 화면이 켜져 있어야 함
import { spoken } from "./srs.js";

const el = new Audio();
el.preload = "auto";
el.setAttribute("playsinline", "");
try { el.preservesPitch = true; } catch {}
// iOS 16.4+: 무음 스위치와 상관없이 재생 + 백그라운드 재생 세션
try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}

let manifest = null, manifestVersion = 0;
export async function loadAudioManifest() {
  try {
    const r = await fetch("audio/manifest.json", { cache: "no-cache" });
    if (r.ok) { const j = await r.json(); manifest = j.files || {}; manifestVersion = j.version || 0; }
  } catch {}
  return manifest;
}
const hasSlowFiles = () => manifestVersion >= 3; // 3판부터 천천히(ws·xs) 음성 파일이 따로 있음
export const hasMp3 = (id) => !!(manifest && manifest[id]);
export const mp3Count = () => (manifest ? Object.keys(manifest).length : 0);
// 음성이 다시 만들어지면 주소가 바뀌도록 버전(해시)을 붙임 → 예전 음성이 폰에 남아 재생되지 않음
export const mp3Url = (id, v) => `audio/${id}_${v}.mp3?h=${manifest?.[id] || ""}`;

// ── 기기 음성(TTS) ──────────────────────────────────────────
let voices = [];
const loadVoices = () => { voices = speechSynthesis?.getVoices?.() || []; };
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function pickVoice(lang) {
  // 성인 남성 목소리 우선 (아이폰: Aaron·Fred·Nathan·Evan / 한국어: Minsu)
  // 성인 남성 목소리 우선 — 아이폰(Aaron·Nathan·Evan), 윈도우(Guy·Andrew·David·Mark), 안드로이드/크롬
  const pref = lang === "en"
    ? ["Aaron", "Nathan", "Evan", "Guy", "Andrew", "Christopher", "David", "Mark", "Fred", "Alex", "Tom", "Google US English Male", "en-us-x-iol", "en-us-x-tpd"]
    : ["Minsu", "InJoon", "Hyunsu", "Jian", "ko-kr-x-koc", "ko-kr-x-kod", "Yuna"];
  const list = voices.filter((v) => v.lang.replace("_", "-").startsWith(lang === "en" ? "en-US" : "ko"));
  return pref.map((n) => list.find((v) => v.name.includes(n))).find(Boolean) || list[0] || null;
}
function ttsOne(text, lang, rate = 1) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "en" ? "en-US" : "ko-KR";
    const v = pickVoice(lang); if (v) u.voice = v;
    u.rate = (lang === "en" ? 0.9 : 1) * rate;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const koText = (s) => s.replace(/\(.*?\)/g, "").trim();

async function ttsVariant(w, v, rate) {
  const en = spoken(w);
  const seq = {
    w: [["en", en]],
    x: [["en", w.example]],
    ek: [["en", en], 800, ["ko", koText(w.meaning)], 800, ["en", en]],
    ke: [["ko", koText(w.meaning)], 2000, ["en", en], 500, ["en", en]],
    ex: [["en", w.example], 700, ["ko", w.example_ko]],
  }[v];
  const g = ttsGen;
  await wait(300); // 첫소리가 잘리지 않게 잠깐 쉬고 시작
  if (g !== ttsGen) return;
  for (const s of seq) {
    if (g !== ttsGen) return;
    if (typeof s === "number") await wait(s / rate); else await ttsOne(s[1], s[0], rate);
  }
}
let ttsGen = 0; // stopAll() 때마다 증가 → 진행 중이던 기기 음성 시퀀스 중단

// ── 퀴즈·카드용 짧은 재생: Web Audio 로 재생 ───────────────
// <audio> 로 매번 파일을 바꿔 틀면 스피커·블루투스가 깨어나는 동안 첫소리(예: "I")가 묻힘.
// 한 번 켠 오디오 출력을 계속 열어 두고(무음 신호 유지), 미리 풀어 둔 소리를 바로 재생한다.
let wctx = null, keep = null, curSrc = null;
export function audioCtx() {
  if (!wctx) {
    wctx = new (window.AudioContext || window.webkitAudioContext)();
    // 들리지 않을 만큼 작은 잡음(-66dB)을 계속 흘려 출력 장치(특히 블루투스)가 잠들지 않게 함
    // (완전 무음이나 너무 작은 신호는 장치가 '소리 없음'으로 보고 꺼 버림)
    const len = wctx.sampleRate, nb = wctx.createBuffer(1, len, wctx.sampleRate), ch = nb.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * 0.0005;
    keep = wctx.createBufferSource(); keep.buffer = nb; keep.loop = true; keep.connect(wctx.destination); keep.start();
  }
  return wctx;
}
async function ready() {
  const c = audioCtx();
  if (c.state !== "running") { try { await c.resume(); } catch {} await wait(150); } // 막 깨어났으면 잠깐 기다림
  return c;
}
// 첫 터치 때 오디오를 미리 깨워 둠 (아이폰은 터치가 있어야 소리가 켜짐)
["pointerdown", "touchend", "keydown"].forEach((ev) => addEventListener(ev, () => { try { audioCtx().resume(); } catch {} }, { passive: true }));

const bufCache = new Map();
function loadBuf(url) {
  if (!bufCache.has(url)) {
    bufCache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error("no file"); return r.arrayBuffer(); })
      .then((ab) => new Promise((ok, no) => audioCtx().decodeAudioData(ab, ok, no)))
      .catch((e) => { bufCache.delete(url); throw e; }));
    if (bufCache.size > 80) bufCache.delete(bufCache.keys().next().value);
  }
  return bufCache.get(url);
}
export function preloadSay(w) { if (hasMp3(w.id)) ["w", "x"].forEach((v) => loadBuf(mp3Url(w.id, v)).catch(() => {})); }

function playElement(url, rate) {
  return new Promise((resolve) => {
    el.onended = el.onerror = () => resolve();
    el.src = url; el.playbackRate = rate;
    el.play().catch(() => resolve());
  });
}

export async function say(w, v = "w", rate = 1) {
  stopAll();
  window.__lastSay = `${w.id}_${v}`; // (테스트·디버그용) 마지막으로 재생한 소리
  const g = ttsGen;
  if (!hasMp3(w.id)) return ttsVariant(w, v, rate);
  // 천천히: 음 높이가 그대로인 '천천히' 전용 파일 사용 (없으면 <audio> 속도 조절)
  const slow = rate < 1 && (v === "w" || v === "x");
  const file = slow && hasSlowFiles() ? v + "s" : v;
  const elemRate = slow && !hasSlowFiles() ? rate : 1;
  try {
    if (elemRate !== 1) throw new Error("use element");
    const [buf, c] = await Promise.all([loadBuf(mp3Url(w.id, file)), ready()]);
    if (g !== ttsGen) return;
    return await new Promise((resolve) => {
      const src = c.createBufferSource();
      src.buffer = buf; src.connect(c.destination);
      src.onended = () => { if (curSrc === src) curSrc = null; resolve(); };
      curSrc = src;
      src.start(c.currentTime + 0.05);
    });
  } catch {
    if (g !== ttsGen) return;
    return playElement(mp3Url(w.id, file), elemRate);
  }
}
export function sayText(text, lang = "en") { stopAll(); return ttsOne(text, lang); }
export function stopAll() {
  ttsGen++;
  try { curSrc?.stop(); } catch {}
  curSrc = null;
  el.onended = el.onerror = null;
  try { el.pause(); } catch {}
  try { speechSynthesis.cancel(); } catch {}
}

// ── 효과음 (WebAudio, 파일 없음) ────────────────────────────
let ctx = null;
export function fx(kind) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    // [주파수, 시작(초), 길이(초)]
    const seq = {
      ok: [[660, 0, 0.18], [880, 0.11, 0.18]],
      no: [[300, 0, 0.18], [220, 0.11, 0.18]],
      win: [[523, 0, 0.18], [659, 0.11, 0.18], [784, 0.22, 0.18], [1047, 0.33, 0.3]],
      // 빠-바-바-밤! 빠바밤~ (통과 팡파르)
      fanfare: [[523, 0, 0.14], [523, 0.15, 0.14], [523, 0.3, 0.14], [659, 0.45, 0.4], [587, 0.9, 0.14], [659, 1.05, 0.14],
                [784, 1.2, 0.7], [1047, 1.2, 0.7], [1319, 1.5, 0.6]],
    }[kind];
    seq.forEach(([f, at, len]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = kind === "fanfare" ? "triangle" : "sine"; o.frequency.value = f;
      const t = ctx.currentTime + at;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(kind === "fanfare" ? 0.16 : 0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + len + 0.02);
    });
  } catch {}
}

// ── 🎧 듣기 반복 모드 ───────────────────────────────────────
export class ListenPlayer {
  constructor() {
    this.items = []; this.words = []; this.idx = 0;
    this.state = "idle"; // idle | playing | paused
    this.opts = { dir: "ek", repeat: 1, rate: 1, example: false, loop: true, sleepMin: 0, shuffle: false };
    this.seconds = 0; this.wordsHeard = 0; this._t0 = 0; this.sleepAt = 0;
    this.onChange = null;   // 화면 갱신
    this.onProgress = null; // 기록 저장 (단어 하나 끝날 때마다)
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && this.state === "waiting-screen") { this.state = "playing"; this.play(); }
    });
  }

  load(words, opts) {
    this.opts = { ...this.opts, ...opts };
    this.words = words;
    this.build();
  }
  build() {
    const list = this.opts.shuffle ? [...this.words].sort(() => Math.random() - 0.5) : this.words;
    this.items = [];
    for (const w of list) {
      for (let r = 0; r < this.opts.repeat; r++) this.items.push({ w, v: this.opts.dir });
      if (this.opts.example) this.items.push({ w, v: "ex" });
      this.items[this.items.length - 1].wordEnd = true;
    }
    this.idx = 0;
  }
  get current() { return this.items[this.idx]?.w || null; }
  urls() { return [...new Set(this.items.filter((i) => hasMp3(i.w.id)).map((i) => mp3Url(i.w.id, i.v)))]; }

  start() {
    if (!this.items.length) return;
    this.seconds = 0; this.wordsHeard = 0;
    this.sleepAt = this.opts.sleepMin ? Date.now() + this.opts.sleepMin * 60000 : 0;
    this.state = "playing";
    this.setupMediaSession();
    this.play();
  }
  play() {
    const item = this.items[this.idx];
    if (!item) {
      if (this.opts.loop && this.items.length) { this.build(); return this.play(); }
      return this.stop("end");
    }
    this.updateMetadata(item.w);
    this._t0 = Date.now();
    this.onChange?.();
    if (hasMp3(item.w.id)) {
      el.onended = () => this.next();
      el.onerror = () => this.fallback(item);
      el.src = mp3Url(item.w.id, item.v);
      el.playbackRate = this.opts.rate;
      el.play().catch(() => this.fallback(item));
    } else this.fallback(item);
  }
  fallback(item) {
    // 화면이 꺼진 상태에서는 기기 음성이 멈추므로 화면이 켜질 때까지 대기
    if (document.hidden) { this.accumulate(); this.state = "waiting-screen"; this.onChange?.(); return; }
    ttsVariant(item.w, item.v, this.opts.rate).then(() => { if (this.state === "playing" && this.items[this.idx] === item) this.next(); });
  }
  accumulate() { if (this._t0) { this.seconds += Math.min(120, (Date.now() - this._t0) / 1000); this._t0 = 0; } }
  next() {
    this.accumulate();
    const item = this.items[this.idx];
    if (item?.wordEnd) { this.wordsHeard++; this.onProgress?.(); }
    this.idx++;
    if (this.sleepAt && Date.now() >= this.sleepAt) return this.stop("sleep");
    if (this.state === "playing") this.play();
  }
  pause() {
    if (this.state !== "playing") return;
    this.accumulate(); this.state = "paused";
    try { el.pause(); } catch {}
    try { speechSynthesis.cancel(); } catch {}
    ttsGen++;
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    this.onChange?.(); this.onProgress?.();
  }
  resume() {
    if (this.state === "playing") return;
    this.state = "playing";
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    if (el.src && hasMp3(this.current?.id) && el.currentTime > 0 && !el.ended) {
      this._t0 = Date.now(); el.play().catch(() => this.play()); this.onChange?.();
    } else this.play();
  }
  skip(dir = 1) {
    // 단어 단위로 앞/뒤 이동
    this.accumulate();
    let i = this.idx;
    if (dir > 0) { while (i < this.items.length && !this.items[i].wordEnd) i++; i++; }
    else {
      i--; while (i > 0 && !this.items[i - 1].wordEnd) i--;            // 현재 단어 시작
      if (this.idx - i <= 1) { i--; while (i > 0 && !this.items[i - 1].wordEnd) i--; } // 이전 단어
    }
    this.idx = Math.max(0, i);
    if (this.state === "playing") { stopAll(); this.play(); } else this.onChange?.();
  }
  stop(reason = "user") {
    this.accumulate();
    this.state = "idle"; stopAll();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
    this.stopReason = reason;
    this.onProgress?.(); this.onChange?.();
  }

  setupMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (a, f) => { try { ms.setActionHandler(a, f); } catch {} };
    set("play", () => this.resume());
    set("pause", () => this.pause());
    set("nexttrack", () => this.skip(1));
    set("previoustrack", () => this.skip(-1));
    set("stop", () => this.stop());
    ms.playbackState = "playing";
  }
  updateMetadata(w) {
    if (!("mediaSession" in navigator) || !window.MediaMetadata) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${w.emoji} ${spoken(w)}`, artist: w.meaning, album: "지후 English 듣기",
      artwork: [{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }],
    });
  }
}
