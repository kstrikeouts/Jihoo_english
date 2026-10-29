// 지후 English — 학생 앱
// 하루 흐름: 복습 → Day N 단어 7개 반복 학습 → 테스트(4지선다 + 스펠링) 전부 맞히면 통과 → 칭찬 씬
import { CONFIG } from "./config.js";
import { DB } from "./db.js";
import * as S from "./srs.js";
import { say, sayText, stopAll, fx, ListenPlayer, loadAudioManifest, mp3Count, mp3Url, hasMp3, preloadSay } from "./audio.js";
import * as P from "./pitch.js";
import { canRecognize, listenOnce, scoreSpeech, scoreSentence, normalize } from "./speech.js";
import { ask } from "./ui.js";
import { celebrate } from "./celebrate.js";

const $app = document.getElementById("app");
const $tabs = document.getElementById("tabs");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LSget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const LSset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const st = {
  words: [], byId: {}, progress: {}, sessions: [], days: {}, tab: "home",
  L: null,                 // 진행 중인 학습
  player: new ListenPlayer(), audioSession: null,
  listen: { list: "today", dir: "ek", repeat: 1, rate: 1, example: false, sleepMin: 0 },
  srBroken: false, wordBox: 1,
};

// ═════════════════════════ 시작 ═════════════════════════
async function boot() {
  await DB.init();
  DB.onSync = () => { const el = document.getElementById("sync"); if (el) el.textContent = syncText(); };
  if (DB.needsLogin()) return renderLogin();
  await start();
}

async function start() {
  try { await DB.loadLearner(); } catch (e) { return renderError(e.message); }
  const [lists] = await Promise.all([
    Promise.all(CONFIG.WORD_FILES.map((f) => fetch(f).then((r) => r.json()))),
    loadAudioManifest(),
  ]);
  st.words = lists.flatMap((l) => l.words);
  st.byId = Object.fromEntries(st.words.map((w) => [w.id, w]));
  st.progress = await DB.loadProgress();
  st.sessions = await DB.loadSessions();
  st.days = await DB.loadDays();
  st.sched = S.buildSchedule(st.words);
  st.listen = { ...st.listen, ...(LSget(DB.k("listenOpts"), {})) };
  DB.flush();
  go("home");
}

function renderError(msg) {
  $tabs.classList.add("hidden");
  $app.innerHTML = `<div class="login"><div class="logo">😵</div><h1>앗, 문제가 생겼어요</h1>
    <p class="muted" style="text-align:center;margin:10px 0 20px">${esc(msg)}</p>
    <button class="btn" onclick="location.reload()">다시 시도</button></div>`;
}

function renderLogin() {
  $tabs.classList.add("hidden");
  $app.className = "app focus";
  $app.innerHTML = `<div class="login stack">
    <div class="logo">🦊</div>
    <h1>지후 English</h1>
    <p class="muted" style="text-align:center">처음 한 번만 부모님 계정으로 로그인해요</p>
    <input class="input" id="em" type="email" autocomplete="username" placeholder="이메일">
    <input class="input" id="pw" type="password" autocomplete="current-password" placeholder="비밀번호">
    <div class="err" id="err"></div>
    <button class="btn" id="go">로그인</button></div>`;
  document.getElementById("go").onclick = async () => {
    const err = document.getElementById("err");
    err.textContent = "";
    try {
      await DB.signIn(document.getElementById("em").value.trim(), document.getElementById("pw").value);
      $app.innerHTML = `<p class="muted" style="text-align:center;padding-top:40vh">불러오는 중…</p>`;
      await start();
    } catch (e) { err.textContent = e.message; }
  };
}

// ═════════════════════════ 공통 계산 ═════════════════════════
const today = () => S.todayKST();
const dayMap = () => S.studyDates(st.sessions);
const totalXP = () => st.sessions.reduce((a, s) => a + (s.xp || 0), 0);
const syncText = () => DB.mode === "local" ? "📱 체험 모드" : DB.pending() ? `☁️ 전송 대기 ${DB.pending()}` : "☁️ 저장됨";
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function callName() {
  const n = DB.learner.name || "";
  const given = n.length === 3 ? n.slice(1) : n;
  const c = given.charCodeAt(given.length - 1);
  const batchim = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return given + (batchim ? "아" : "야");
}

function saveSess(s) {
  DB.saveSession(s);
  const i = st.sessions.findIndex((x) => x.id === s.id);
  if (i >= 0) st.sessions[i] = { ...s }; else st.sessions.push({ ...s });
}
function newSession(kind) {
  return {
    id: S.uuid(), learner_id: DB.learner.id, kind, started_at: S.nowISO(), ended_at: S.nowISO(),
    new_words: 0, reviewed_words: 0, correct: 0, xp: 0, audio_seconds: 0, audio_words: 0,
  };
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2500);
}

// ── Day 일정: 학습 5일(하루 7개) → 복습 Day 1일 반복 ──
const sched = (d) => st.sched[d - 1];
const dayWords = (d) => sched(d)?.words || [];
const lastDay = () => st.sched.length;
const dayTheme = (d) => sched(d)?.theme || "";
const isReviewDay = (d) => sched(d)?.kind === "review";
const passedDays = () => Object.values(st.days).filter((r) => r.status === "passed");
const passedToday = () => passedDays().find((r) => r.passed_at && S.kstDate(r.passed_at) === today());
function currentDay() {
  for (let d = 1; d <= lastDay(); d++) if (st.days[d]?.status !== "passed") return d;
  return null;
}
function dayRec(d) {
  return st.days[d] ? { ...st.days[d] } : {
    learner_id: DB.learner.id, day: d, kind: sched(d)?.kind || "learn", word_ids: dayWords(d).map((w) => w.id), status: "learning",
    warmup_at: null,
    started_at: null, learned_at: null, passed_at: null, test_rounds: 0, first_correct: null, first_total: null,
    updated_at: S.nowISO(),
  };
}
function saveDay(rec) {
  rec.updated_at = S.nowISO();
  st.days[rec.day] = { ...rec };
  DB.saveDay(rec);
}
// 학습 Day 시작 전 워밍업: 전날 Day 단어 + 복습 날짜가 된 단어 (최대 14개)
function warmupWords(d) {
  const seen = new Set(dayWords(d).map((w) => w.id));
  const out = [];
  const prev = d > 1 && sched(d - 1)?.kind === "learn" && st.days[d - 1]?.status === "passed" ? d - 1 : null;
  if (prev) dayWords(prev).forEach((w) => { seen.add(w.id); out.push(w); });
  S.dueList(st.progress, CONFIG.REVIEW_CAP).forEach((p) => {
    const w = st.byId[p.word_id];
    if (w && !seen.has(w.id)) { seen.add(w.id); out.push(w); }
  });
  return { prevDay: prev, words: out.slice(0, 14) };
}
function reviewDue() {
  const cur = new Set(dayWords(currentDay() || 0).map((w) => w.id));
  return S.dueList(st.progress, CONFIG.REVIEW_CAP).filter((p) => !cur.has(p.word_id) && st.byId[p.word_id]);
}

// ═════════════════════════ 탭 ═════════════════════════
function go(tab) {
  st.tab = tab;
  if (tab !== "listen" && st.player.state === "idle") stopAll();
  document.querySelector(".party")?.remove();
  $app.className = "app";
  $tabs.classList.remove("hidden");
  $tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  ({ home: renderHome, listen: renderListen, words: renderWords, rewards: renderRewards })[tab]();
  window.scrollTo(0, 0);
}
$tabs.addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) go(b.dataset.tab); });

function statusbar() {
  return `<div class="statusbar">
    <div class="chips"><span class="chip fire">🔥 ${S.streak(dayMap())}일</span><span class="chip star">⭐ ${totalXP()}</span></div>
    <span class="sync" id="sync">${syncText()}</span></div>`;
}

function stampBoard(highlight) {
  const n = lastDay();
  return `<div class="stamps">${Array.from({ length: n }, (_, i) => {
    const d = i + 1, r = st.days[d];
    const rv = isReviewDay(d);
    const passed = r?.status === "passed", perfect = passed && r.first_correct === r.first_total;
    const cls = [passed ? (perfect ? "on perfect" : "on") : d === highlight ? "cur" : "", rv ? "rv" : ""].join(" ");
    const label = passed ? (rv ? "🌟" : perfect ? "💯" : "✔") : rv ? `<small>복습</small>${d}` : d;
    return `<span class="${cls}" title="Day ${d}${rv ? " 복습" : ""}">${label}</span>`;
  }).join("")}</div>`;
}

// ── 홈 ───────────────────────────────────────────
function renderHome() {
  const due = reviewDue().length;
  const doneRec = passedToday();
  const d = currentDay();
  const lv = S.levelOf(totalXP());
  const passed = passedDays().length;
  let main;

  if (doneRec) {
    main = `<section class="card mission today-done">
      <div class="td-medal">🏅</div>
      <p class="td-title">오늘 Day ${doneRec.day} 통과!</p>
      <p class="muted">${!d ? `${lastDay()}일 단어장을 모두 끝냈어요!` : isReviewDay(d)
        ? `내일은 Day ${d} · 🌟 복습 Day! ${esc(dayTheme(d))}` : `내일은 Day ${d} · ${esc(dayTheme(d))} 단어를 만나요`}</p>
      <div class="stack" style="margin-top:16px">
        <button class="btn sky" id="toListen">🎧 오늘 단어 듣기</button>
        ${due ? `<button class="btn ghost" id="revOnly">🔁 복습 ${due}개 하기</button>` : ""}
      </div></section>`;
  } else if (!d) {
    main = `<section class="card mission today-done"><div class="td-medal">👑</div>
      <p class="td-title">4학년 단어장 완주!</p><p class="muted">${lastDay()}일 동안 ${st.words.length}개를 모두 통과했어요</p>
      ${due ? `<button class="btn" id="revOnly" style="margin-top:16px">🔁 복습 ${due}개 하기</button>` : ""}</section>`;
  } else {
    const rec = dayRec(d), ws = dayWords(d), rv = isReviewDay(d);
    const learned = rec.status !== "learning";
    const warm = warmupWords(d);
    const warmDone = !!rec.warmup_at || !warm.words.length;
    const chips = rv
      ? ws.slice(0, 6).map((w) => `<span title="${esc(w.word)}">${w.emoji}</span>`).join("") + `<span class="more">+${ws.length - 6}</span>`
      : ws.map((w) => `<span title="${esc(w.word)}">${w.emoji}</span>`).join("");
    main = `<section class="card mission ${rv ? "review-day" : ""}">
      <div class="day-head"><span class="day-badge">Day ${d}</span><span class="day-theme">${rv ? "🌟 복습 Day" : esc(dayTheme(d))}</span></div>
      ${rv ? `<p class="muted" style="margin-top:6px">${esc(dayTheme(d))} · 지난 5일 동안 배운 단어 ${ws.length}개를 다시 연습해요</p>` : ""}
      <div class="chips7">${chips}</div>
      <ul class="steps">
        ${rv || (!warm.words.length && !rec.warmup_at) ? "" : `<li class="${warmDone ? "done" : ""}"><span class="ic">☀️</span>${warm.prevDay ? `어제 배운 Day ${warm.prevDay} 복습` : "지난 단어 복습"}<span class="num">${warmDone ? "" : warm.words.length + "개"}</span></li>`}
        <li class="${learned ? "done" : ""}"><span class="ic">${rv ? "🔁" : "✨"}</span>${rv ? `단어 ${ws.length}개 반복 학습` : `오늘 단어 ${ws.length}개 반복 학습`}<span class="num"></span></li>
        <li><span class="ic">📝</span>${rv ? "복습 테스트 모두 맞히기" : "테스트 모두 맞히기"}<span class="num">${rec.test_rounds ? `도전 ${rec.test_rounds}번` : ""}</span></li>
      </ul>
      <button class="btn" id="startL">${learned ? "테스트 도전 ▶" : rec.started_at ? "이어서 하기 ▶" : "오늘 학습 시작 ▶"}</button>
      ${learned ? `<button class="btn ghost small" id="reLearn" style="margin-top:12px">단어 한 번 더 연습하고 테스트</button>` : ""}
    </section>`;
  }

  $app.innerHTML = `${statusbar()}
    <h1>${esc(callName())}, 안녕! 👋</h1>
    <p class="muted">레벨 ${lv} · 다음 레벨까지 ⭐ ${lv * 200 - totalXP()}</p>
    ${main}
    <h2>도장판 <small class="muted" style="font-size:18px">${passed}/${lastDay()} Day</small></h2>
    <div class="card">${stampBoard(d)}<p class="stamp-note">5일 배우고, 6일째는 🌟 복습 Day</p></div>`;
  document.getElementById("startL")?.addEventListener("click", () => startToday());
  document.getElementById("reLearn")?.addEventListener("click", () => startToday({ relearn: true }));
  document.getElementById("revOnly")?.addEventListener("click", () => startToday({ reviewOnly: true }));
  document.getElementById("toListen")?.addEventListener("click", () => { st.listen.list = "today"; go("listen"); });
}

// ═════════════════════════ 학습 엔진 ═════════════════════════
// 철자 문제로 낼 수 있는지: 알파벳·띄어쓰기만, 글자 10개 이하
const letterCount = (w) => w.word.replace(/ /g, "").length;
const spellable = (w) => /^[A-Za-z ]+$/.test(w.word) && letterCount(w) <= 10;

function reviewMode(p, w) {
  const opts = p.box <= 2 ? ["listen_pick", "meaning_pick"]
    : p.box <= 4 ? (spellable(w) ? ["spell", "meaning_pick"] : ["meaning_pick", "speak"])
    : ["speak", spellable(w) ? "spell" : "meaning_pick"];
  return pick(opts);
}

function startToday(opts = {}) {
  const phases = [];
  const d = currentDay();
  if (opts.reviewOnly || !d || passedToday()) {
    const due = reviewDue();
    if (due.length) phases.push(() => reviewPhase(due));
  } else {
    const rec = dayRec(d);
    if (!rec.started_at) { rec.started_at = S.nowISO(); saveDay(rec); }
    const learning = rec.status === "learning" || opts.relearn;
    if (isReviewDay(d)) {
      if (learning) phases.push(() => reviewDayPractice(d));
    } else {
      const warm = warmupWords(d);
      if (!rec.warmup_at && warm.words.length && rec.status === "learning") phases.push(() => warmupPhase(d, warm));
      if (learning) phases.push(() => learnPhase(d, !!opts.relearn));
    }
    phases.push(() => testPhase(d));
  }
  if (!phases.length) return renderHome();
  st.L = { session: newSession(opts.reviewOnly ? "review" : "lesson"), phases, p: -1, steps: [], i: 0, label: "", combo: 0 };
  saveSess(st.L.session);
  $tabs.classList.add("hidden");
  $app.className = "app focus";
  nextPhase();
}

function nextPhase() {
  const L = st.L;
  L.p++;
  if (L.p >= L.phases.length) return finishReviewOnly();
  L.phases[L.p]();
}
function runSteps(label, steps, onDone) {
  Object.assign(st.L, { label, steps, i: 0, onDone });
  renderStep();
}
function nextStep() {
  document.querySelector(".feedback")?.remove();
  clearTimeout(st.L?.auto); clearTimeout(st.L?.sayT);
  const L = st.L;
  L.i++;
  if (L.i >= L.steps.length) return (L.onDone || nextPhase)();
  renderStep();
}
function renderStep() {
  const step = st.L.steps[st.L.i];
  const w = st.byId[step.id];
  ({ phase: stepPhase, intro: stepIntro, echo: stepEcho, practice: stepQuiz, test: stepQuiz, review: stepQuiz, quiz: stepQuiz,
     testintro: stepTestIntro })[step.type](step, w);
}

function lessonFrame(inner) {
  const L = st.L;
  const pct = Math.round((L.i / Math.max(1, L.steps.length)) * 100);
  $app.innerHTML = `<div class="lesson-top"><button class="x-btn" id="quit" aria-label="그만하기">✕</button>
    <div class="bar"><i style="width:${pct}%"></i></div><span class="phase-chip">${esc(L.label)}</span></div>
    <div id="stage">${inner}</div>`;
  document.getElementById("quit").onclick = async () => {
    if (await ask("그만할까요? 지금까지 한 것은 저장돼요.", "그만하기", "계속하기")) endLesson();
  };
}

function stepPhase(step) {
  lessonFrame(`<div class="celebrate"><div class="big">${step.emoji}</div><h1>${esc(step.title)}</h1>
    <p class="muted" style="margin:6px 0 28px">${esc(step.sub)}</p><button class="btn" id="go">시작!</button></div>`);
  document.getElementById("go").onclick = nextStep;
}

// 재생 버튼: 🔊 보통 속도 + 🐢 천천히 (kind: w=단어, x=예문)
const SLOW = 0.7;
function sndBtns(kind, label) {
  return `<div class="snd"><button class="sbtn" data-snd="${kind}">🔊 ${label}</button>
    <button class="sbtn slow" data-snd="${kind}" data-slow="1">🐢 천천히</button></div>`;
}
function bindSnd(w) {
  document.querySelectorAll("[data-snd]").forEach((b) => (b.onclick = () => say(w, b.dataset.snd, b.dataset.slow ? SLOW : 1)));
}

// ── 1. 복습 ──
function reviewPhase(due) {
  const steps = [{ type: "phase", emoji: "🔁", title: "복습 시간", sub: `전에 배운 단어 ${due.length}개를 다시 만나요` }];
  S.shuffle(due).forEach((p) => { const w = st.byId[p.word_id]; steps.push({ type: "review", id: w.id, mode: reviewMode(p, w) }); });
  runSteps("복습", steps, nextPhase);
}

// ── 1-1. 워밍업: 어제 배운 단어 간단 복습 (단어당 1문제, 틀리면 끝에 한 번 더) ──
function warmupPhase(d, warm) {
  const steps = [{ type: "phase", emoji: "☀️", title: warm.prevDay ? `어제 배운 Day ${warm.prevDay} 복습` : "지난 단어 복습",
    sub: `${warm.words.length}개만 빠르게 확인하고 오늘 단어로 넘어가요` }];
  S.shuffle(warm.words).forEach((w, i) => steps.push({ type: "review", id: w.id, mode: i % 2 ? "listen_pick" : "meaning_pick" }));
  runSteps("어제 복습", steps, () => {
    const rec = dayRec(d); rec.warmup_at = S.nowISO(); saveDay(rec);
    nextPhase();
  });
}

// ── 복습 Day: 지난 5일 단어 전체 반복 학습 (틀리면 맞힐 때까지) ──
function reviewDayPractice(d) {
  const ws = dayWords(d);
  const steps = [{ type: "phase", emoji: "🌟", title: `Day ${d} · 복습 Day`, sub: `${dayTheme(d)} — 단어 ${ws.length}개를 다시 연습해요. 틀린 단어는 맞힐 때까지 다시 나와요` }];
  S.shuffle(ws).forEach((w, i) => steps.push({ type: "practice", id: w.id,
    mode: i % 3 === 2 && spellable(w) ? "spell" : i % 2 ? "listen_pick" : "meaning_pick" }));
  runSteps("복습 Day 반복 학습", steps, () => {
    const rec = dayRec(d);
    if (rec.status === "learning") { rec.status = "testing"; rec.learned_at = S.nowISO(); saveDay(rec); }
    nextPhase();
  });
}

// ── 2. 오늘 단어 반복 학습 ──
function learnPhase(d, relearn) {
  const ws = dayWords(d);
  const steps = [];
  if (!relearn) {
    steps.push({ type: "phase", emoji: "✨", title: `Day ${d} · ${dayTheme(d)}`, sub: `오늘의 단어 ${ws.length}개를 만나요` });
    ws.forEach((w) => steps.push({ type: "intro", id: w.id }));
    steps.push({ type: "phase", emoji: "🎲", title: "한 번 더! 랜덤 발음", sub: "단어나 문장이 무작위로 나와요. 정확하게 말하면 통과!" });
    S.shuffle(ws).forEach((w) => steps.push({ type: "echo", id: w.id, kind: Math.random() < 0.5 ? "w" : "x" }));
  }
  steps.push({ type: "phase", emoji: "🔁", title: "반복 연습", sub: "모두 맞힐 때까지 연습해요. 틀려도 괜찮아요!" });
  for (const mode of ["listen_pick", "meaning_pick", "spell"]) {
    S.shuffle(ws.filter((w) => mode !== "spell" || spellable(w))).forEach((w) => steps.push({ type: "practice", id: w.id, mode }));
  }
  runSteps("반복 학습", steps, () => {
    const rec = dayRec(d);
    if (rec.status === "learning") { rec.status = "testing"; rec.learned_at = S.nowISO(); saveDay(rec); }
    nextPhase();
  });
}

// ═════════════ 따라 말하기: 정확도 판정 + 억양·강세 그래프 ═════════════
const selfMode = () => !canRecognize || st.srBroken; // 마이크(받아쓰기)가 안 되면 스스로 체크

function speakPanelHTML() {
  return `<div class="speak-panel">
      <div class="sp-task" id="spTask"></div>
      <canvas class="pgraph" id="pgraph"></canvas>
      <div class="pg-legend"><span class="lg ref">원어민</span><span class="lg kid">지후</span>
        <span class="pg-score" id="pgScore">높낮이 = 억양 · 막대 = 강세</span></div>
      <div class="heard" id="heard"></div>
    </div>`;
}

// 한 번 말하기를 판정: 정확하면 true. 그래프는 말하는 동안 실시간으로 그려짐
function makeSpeaker(w) {
  const sp = { w, kind: "w", refShape: null, fails: 0 };
  const canvas = () => document.getElementById("pgraph");
  sp.setKind = async (kind) => {
    sp.kind = kind; sp.refShape = null;
    const c = canvas(); if (!c) return;
    P.draw(c, {});
    if (hasMp3(w.id)) {
      const ref = await P.refContour(mp3Url(w.id, kind));
      if (sp.kind !== kind || !document.body.contains(c)) return;
      sp.refShape = P.shape(ref);
      P.draw(c, { ref: sp.refShape });
    }
  };
  sp.attempt = async () => {
    const heard = document.getElementById("heard"), score = document.getElementById("pgScore"), mic = document.getElementById("mic");
    if (selfMode()) { heard.textContent = "잘했어요! 👏"; fx("ok"); return true; }
    stopAll(); clearTimeout(st.L?.sayT);
    const target = sp.kind === "w" ? S.spoken(w) : w.example;
    const liveMax = Math.max(sp.kind === "w" ? 2.5 : 4, (sp.refShape?.dur || 1) * 1.8);
    let cap = null;
    if (!st.graphOff && navigator.mediaDevices?.getUserMedia) {
      cap = new P.LiveCapture((d) => { const c = canvas(); if (c) P.draw(c, { ref: sp.refShape, live: true, liveData: d, liveMax }); });
      try { await cap.start(); } catch { cap = null; }
    }
    mic.classList.add("on"); heard.textContent = "듣고 있어요… 말해 보세요!";
    let alts;
    try {
      try { alts = await listenOnce({ timeoutMs: sp.kind === "w" ? 6000 : 9000 }); }
      catch (e) {
        // 그래프용 마이크와 받아쓰기가 충돌하면 그래프를 끄고 한 번 더
        if (cap && /audio-capture|aborted/.test(e.message)) {
          cap.stop(); cap = null; st.graphOff = true;
          heard.textContent = "다시 한 번 말해 보세요!";
          alts = await listenOnce({ timeoutMs: sp.kind === "w" ? 6000 : 9000 });
        } else throw e;
      }
    } catch (e) {
      cap?.stop();
      if (/not-allowed|service-not-allowed|unsupported/.test(e.message)) {
        st.srBroken = true; heard.textContent = "마이크(받아쓰기)가 꺼져 있어요. 소리 내어 말한 다음 버튼을 눌러요";
        const m = document.getElementById("mic"); if (m) m.textContent = "🗣️ 말했어요";
      } else heard.textContent = "잘 안 들렸어요. 한 번 더 눌러 볼까요?";
      mic.classList.remove("on");
      return false;
    }
    mic.classList.remove("on");
    // 그래프 결과
    const kidShape = cap ? P.shape(cap.stop()) : null;
    const c = canvas();
    if (c && (kidShape || sp.refShape)) P.draw(c, { ref: sp.refShape, kid: kidShape });
    const cmp = P.compare(sp.refShape, kidShape);
    if (score) score.innerHTML = cmp
      ? `억양 <b>${cmp.tone ?? "–"}%</b> · 강세 <b>${cmp.stress}%</b>`
      : kidShape ? "원어민 그래프는 음성 파일이 있을 때 나와요" : "높낮이 = 억양 · 막대 = 강세";
    // 정확도 판정
    let ok, transcript;
    if (sp.kind === "w") { const r = scoreSpeech(target, alts); ok = r.score >= 3; transcript = r.transcript; }
    else { const r = scoreSentence(target, alts, sentenceParts(w).keys); ok = r.pass; transcript = r.transcript; }
    record(w, { mode: sp.kind === "w" ? "speak" : "chunk_speak", phase: "practice", correct: ok, score: ok ? 3 : 1, transcript });
    if (ok) { fx("ok"); heard.textContent = `"${transcript}" — 정확해요! 👍`; sp.fails = 0; }
    else { sp.fails++; heard.textContent = `"${transcript}" 라고 들렸어요. 다시 또박또박!`; }
    return ok;
  };
  return sp;
}

// ── 새 단어 카드: 단어 1번 + 문장 1번 정확하게 따라하면 다음 ──
function stepIntro(step, w) {
  if (!st.progress[w.id]) {
    const p = S.newProgress(DB.learner.id, w.id);
    st.progress[w.id] = p; DB.saveProgress(p);
    st.L.session.new_words++; st.L.session.xp += 5; saveSess(st.L.session);
  }
  const L = st.L;
  preloadSay(w); const nx = st.byId[L.steps[L.i + 1]?.id]; if (nx) preloadSay(nx); // 소리 미리 준비
  L.reps = L.reps || {};
  const done = (L.reps[w.id] = L.reps[w.id] || { w: false, x: false });
  const en = S.spoken(w);
  const intros = L.steps.filter((s) => s.type === "intro");
  const n = intros.indexOf(step) + 1;
  const prevIsIntro = L.steps[L.i - 1]?.type === "intro";
  lessonFrame(`<div class="intro-head"><p class="phase">새 단어 ${n}/${intros.length}${w.type === "idiom" ? " · 숙어" : ""}</p>
      ${prevIsIntro ? `<button class="prev-btn" id="prev">◀ 이전 단어</button>` : ""}</div>
    <div class="card wordcard">
      <div class="emoji">${w.emoji}</div>
      <div class="word ${en.length > 10 ? "long" : ""}">${esc(en)}</div>
      <div class="meaning">${esc(w.meaning)}</div>
      ${sndBtns("w", "단어 듣기")}
      <div class="ex"><div class="ex-label">예문</div><div class="en">${esc(w.example)}</div><div class="ko">${esc(w.example_ko)}</div>
        ${sndBtns("x", "문장 듣기")}</div>
    </div>
    <div class="tasks"><span class="task" id="tW">① 단어 따라하기</span><span class="task" id="tX">② 문장 따라하기</span></div>
    ${speakPanelHTML()}
    <div class="row" style="margin-top:8px">
      <button class="btn sky" id="mic">${selfMode() ? "🗣️ 말했어요" : "🎤 따라하기"}</button>
      <button class="btn" id="go">다음 ▶</button></div>
    <div id="skipBox" style="text-align:center;margin-top:10px"></div>`);
  L.sayT = setTimeout(() => say(w, "w"), 500);
  bindSnd(w);
  const sp = makeSpeaker(w);
  const cur = () => (!done.w ? "w" : !done.x ? "x" : null);
  const refresh = () => {
    document.getElementById("tW").className = "task " + (done.w ? "ok" : cur() === "w" ? "now" : "");
    document.getElementById("tX").className = "task " + (done.x ? "ok" : cur() === "x" ? "now" : "");
    const k = cur();
    document.getElementById("spTask").innerHTML = k === "w" ? `🎯 단어를 따라 말해요: <b>${esc(en)}</b>`
      : k === "x" ? `🎯 이제 문장을 따라 말해요: <b>${esc(w.example)}</b>` : "🎉 완벽해요! 다음 단어로 가요";
    const go = document.getElementById("go");
    go.disabled = !!k; go.classList.toggle("ready", !k);
    document.getElementById("mic").disabled = !k;
    if (k && k !== sp.kind) sp.setKind(k);
  };
  sp.setKind(cur() || "w");
  refresh();
  document.getElementById("prev")?.addEventListener("click", () => { stopAll(); clearTimeout(L.sayT); L.i--; renderStep(); });
  document.getElementById("go").onclick = () => { if (cur()) return; stopAll(); nextStep(); };
  document.getElementById("mic").onclick = async () => {
    const k = cur(); if (!k) return;
    if (await sp.attempt()) {
      done[k] = true;
      if (!cur()) { fx("win"); L.session.xp += 2; saveSess(L.session); }
      setTimeout(refresh, 600);
    } else if (sp.fails >= 5) showSkip(() => { done[k] = true; refresh(); });
  };
}

// 인식이 계속 안 될 때 막히지 않도록 (5번 실패 후)
function showSkip(fn) {
  const box = document.getElementById("skipBox");
  if (!box || box.childElementCount) return;
  box.innerHTML = `<button class="hint-btn" id="skipSay">계속 안 되면 다음에 다시 해요 ▶</button>`;
  document.getElementById("skipSay").onclick = () => { box.innerHTML = ""; fn(); };
}

// ── 한 번 더! 랜덤 발음 (첫 턴이 끝난 뒤 단어마다 한 번씩, 단어 또는 문장) ──
function stepEcho(step, w) {
  const L = st.L;
  preloadSay(w);
  const echoes = L.steps.filter((s) => s.type === "echo");
  const n = echoes.indexOf(step) + 1;
  const isW = step.kind === "w";
  const shown = isW ? S.spoken(w) : w.example;
  lessonFrame(`<p class="phase">한 번 더 · 랜덤 발음 ${n}/${echoes.length}</p>
    <p class="prompt">${isW ? "이 단어를 말해 보세요" : "이 문장을 말해 보세요"}</p>
    <div class="card wordcard" style="padding:18px">
      <div class="emoji" style="font-size:60px">${w.emoji}</div>
      ${isW ? `<div class="word ${shown.length > 10 ? "long" : ""}">${esc(shown)}</div><div class="meaning">${esc(w.meaning)}</div>`
            : `<div class="pattern">${esc(shown)}</div><div class="muted" style="font-size:18px">${esc(w.example_ko)}</div>`}
      ${sndBtns(step.kind, isW ? "단어 듣기" : "문장 듣기")}
    </div>
    ${speakPanelHTML()}
    <button class="btn sky" id="mic" style="margin-top:8px">${selfMode() ? "🗣️ 말했어요" : "🎤 말하기"}</button>
    <div id="skipBox" style="text-align:center;margin-top:10px"></div>`);
  bindSnd(w);
  const sp = makeSpeaker(w);
  sp.setKind(step.kind);
  document.getElementById("spTask").innerHTML = `🎯 ${isW ? "단어를" : "문장을"} 정확하게 말하면 다음으로!`;
  const pass = () => {
    document.getElementById("mic").disabled = true;
    L.session.xp += 2; saveSess(L.session);
    L.auto = setTimeout(() => { stopAll(); nextStep(); }, 1300);
  };
  document.getElementById("mic").onclick = async () => {
    if (await sp.attempt()) pass();
    else if (sp.fails >= 5) showSkip(pass);
  };
}

// ── 3. 테스트 ──
function testPhase(d) {
  const ws = dayWords(d);
  let cw = ws, sw = ws;
  if (isReviewDay(d)) {
    // 복습 Day 테스트: 4지선다 10 + 스펠링 10 — 자주 틀린 단어부터
    const weak = (w) => { const p = st.progress[w.id]; return (p ? p.wrong_count * 2 - p.correct_count * 0.2 : 0) + Math.random(); };
    const ranked = [...ws].sort((a, b) => weak(b) - weak(a));
    cw = ranked.slice(0, 10);
    sw = ranked.filter((w) => spellable(w) && !cw.includes(w)).slice(0, 10);
  }
  const choice = S.shuffle(cw).map((w, i) => ({ type: "test", id: w.id, mode: i % 2 ? "listen_pick" : "meaning_pick", part: 1 }));
  const spell = S.shuffle(sw).map((w) => ({ type: "test", id: w.id, mode: spellable(w) ? "spell" : "listen_pick", part: 2 }));
  // 3부: 문장 말하기 (마이크·받아쓰기가 될 때만) — 학습 Day 3문장, 복습 Day 5문장
  const talk = canRecognize && !st.srBroken
    ? S.shuffle(ws).slice(0, isReviewDay(d) ? 5 : 3).map((w) => ({ type: "test", id: w.id, mode: "chunk_speak", part: 3 })) : [];
  st.L.test = { day: d, results: [], total: choice.length + spell.length + talk.length };
  const steps = [{ type: "testintro", day: d, n1: choice.length, n2: spell.length, n3: talk.length }, ...choice,
    { type: "phase", emoji: "🔤", title: "2부 · 스펠링", sub: "알파벳을 하나씩 눌러 단어를 완성해요" }, ...spell];
  if (talk.length) steps.push({ type: "phase", emoji: "🎤", title: "3부 · 문장 말하기", sub: "문장을 정확하게 읽으면 통과! 먼저 들어 봐도 돼요" }, ...talk);
  runSteps(`Day ${d} 테스트`, steps, () => testRoundEnd(d));
}

function stepTestIntro(step) {
  const rec = dayRec(step.day);
  const rv = isReviewDay(step.day);
  lessonFrame(`<div class="celebrate"><div class="big">${rv ? "🌟" : "📝"}</div><h1>Day ${step.day} ${rv ? "복습 " : ""}테스트</h1>
    <p class="muted" style="margin:6px 0 18px">${rv ? `모두 맞히면 ${esc(dayTheme(step.day))} 통과!` : "모두 맞히면 오늘 단어 통과!"}</p>
    <div class="card test-rules">
      <div><b>1부</b> 4지선다 ${step.n1}문제</div>
      <div><b>2부</b> 스펠링 ${step.n2}문제</div>
      ${step.n3 ? `<div><b>3부</b> 문장 말하기 ${step.n3}문제</div>` : ""}
      <div class="muted">힌트는 없어요. 틀린 문제는 다시 도전할 수 있어요</div>
    </div>
    ${rec.test_rounds ? `<p class="muted" style="margin:12px 0 0">지난번에 ${rec.test_rounds}번 도전했어요. 이번엔 할 수 있어!</p>` : ""}
    <button class="btn" id="go" style="margin-top:22px">테스트 시작!</button></div>`);
  document.getElementById("go").onclick = nextStep;
}

function testRoundEnd(d) {
  const L = st.L, T = L.test;
  const rec = dayRec(d);
  const correct = T.results.filter((r) => r.ok).length;
  const wrong = T.results.filter((r) => !r.ok).map((r) => r.q);
  rec.test_rounds = (rec.test_rounds || 0) + 1;
  if (rec.first_total == null) { rec.first_total = T.results.length; rec.first_correct = correct; }
  if (rec.status === "learning") { rec.status = "testing"; rec.learned_at = rec.learned_at || S.nowISO(); }

  if (!wrong.length) {
    const perfect = rec.first_correct === rec.first_total;
    rec.status = "passed"; rec.passed_at = S.nowISO();
    saveDay(rec);
    const bonus = (isReviewDay(d) ? 100 : 50) + (perfect ? 30 : 0);
    L.session.xp += bonus; L.session.ended_at = S.nowISO(); saveSess(L.session);
    DB.flush();
    return celebrate({
      name: callName(), day: d, theme: dayTheme(d), perfect, rounds: rec.test_rounds, review: isReviewDay(d),
      firstCorrect: rec.first_correct, total: rec.first_total, xp: bonus, wordCount: dayWords(d).length,
      words: isReviewDay(d) ? S.shuffle(dayWords(d)).slice(0, 7) : dayWords(d), stamps: stampBoard(), say: sayText, fx,
      onHome: () => endLesson(), onListen: () => { endLesson(false); st.listen.list = "today"; go("listen"); },
    });
  }
  saveDay(rec);
  const ws = [...new Set(wrong.map((q) => q.id))].map((id) => st.byId[id]);
  lessonFrame(`<div class="celebrate"><div class="big">💪</div>
    <h1>${correct}개 맞았어요!</h1>
    <p class="muted" style="margin:6px 0 16px">틀린 <b style="color:var(--primary-d)">${wrong.length}문제</b>만 다시 맞히면 통과예요</p>
    <div class="wlist" style="text-align:left">${ws.map((w) => `<button class="wrow" data-id="${w.id}"><span class="em">${w.emoji}</span>
      <span><div class="w">${esc(S.spoken(w))}</div><div class="m">${esc(w.meaning)}</div></span><span class="bx" style="background:var(--sky)">🔊</span></button>`).join("")}</div>
    <p class="muted" style="font-size:17px;margin:10px 0 18px">단어를 눌러 한 번 더 들어 보세요</p>
    <button class="btn" id="again">다시 도전!</button></div>`);
  document.querySelectorAll(".wrow").forEach((b) => (b.onclick = () => say(st.byId[b.dataset.id], "ek")));
  document.getElementById("again").onclick = () => {
    T.results = [];
    runSteps(`Day ${d} 재도전`, S.shuffle(wrong).map((q) => ({ ...q, retryRound: true })), () => testRoundEnd(d));
  };
}

// ═════════════════════════ 문제 화면 ═════════════════════════
function distractors(w, n = 3) {
  const others = st.words.filter((x) => x.id !== w.id);
  const sameDay = S.shuffle(others.filter((x) => x.day === w.day)).slice(0, 2);
  const out = [];
  for (const x of [...sameDay, ...S.shuffle(others.filter((x) => x.type === w.type)), ...S.shuffle(others)]) {
    if (out.length >= n) break;
    if ([w, ...out].some((y) => y.emoji === x.emoji || y.meaning === x.meaning || S.spoken(y) === S.spoken(x))) continue;
    out.push(x);
  }
  return out;
}

function phaseLabel(step) {
  if (step.type === "test") return `${step.part === 3 ? "3부 · 문장 말하기" : step.part === 2 ? "2부 · 스펠링" : "1부 · 4지선다"}${step.retryRound ? " · 재도전" : ""}`;
  if (step.type === "review" || step.type === "quiz") return `복습${step.retry ? " · 다시 도전" : ""}`;
  return `연습${step.again ? " · 한 번 더" : ""}`;
}

function stepQuiz(step, w) {
  if (step.mode === "spell") return quizSpell(step, w);
  if (step.mode === "speak") return quizSpeak(step, w);
  if (step.mode === "chunk_speak") return quizSentence(step, w);
  const isTest = step.type === "test";
  const opts = S.shuffle([w, ...distractors(w)]);
  const listen = step.mode === "listen_pick";
  const head = listen
    ? `<p class="prompt">잘 듣고 알맞은 뜻을 골라요</p>
       <div style="text-align:center;margin-bottom:18px"><button class="speaker big" id="spk">🔊</button>
         <div><button class="sbtn slow" id="spkSlow" style="margin-top:12px">🐢 천천히 듣기</button></div></div>`
    : `<p class="prompt">영어로 뭐라고 할까요?</p>
       <div class="card wordcard" style="padding:18px;margin-bottom:18px"><div class="emoji" style="font-size:64px">${w.emoji}</div>
       <div class="meaning">${esc(w.meaning)}</div></div>`;
  const optHtml = opts.map((o) => listen
    ? `<button class="opt" data-id="${o.id}"><span class="em">${o.emoji}</span>${esc(o.meaning)}</button>`
    : `<button class="opt en" data-id="${o.id}">${esc(S.spoken(o))}</button>`).join("");
  lessonFrame(`<p class="phase">${phaseLabel(step)}</p>${head}
    <div class="options ${!listen && opts.some((o) => S.spoken(o).length > 11) ? "one-col" : ""}">${optHtml}</div>
    ${isTest ? "" : `<div style="text-align:center;margin-top:18px"><button class="hint-btn" id="hint">💡 힌트</button></div>`}`);

  let hint = false, answered = false;
  if (listen) {
    st.L.sayT = setTimeout(() => say(w, "w"), 500);
    document.getElementById("spk").onclick = () => say(w, "w");
    document.getElementById("spkSlow").onclick = () => say(w, "w", SLOW);
  }
  document.getElementById("hint")?.addEventListener("click", (e) => {
    hint = true; e.currentTarget.remove();
    S.shuffle([...document.querySelectorAll(".opt")].filter((b) => b.dataset.id !== w.id)).slice(0, 2).forEach((b) => b.classList.add("gone"));
  });
  document.querySelectorAll(".opt").forEach((b) => (b.onclick = () => {
    if (answered) return; answered = true;
    const ok = b.dataset.id === w.id;
    b.classList.add(ok ? "right" : "wrong");
    if (!ok) document.querySelector(`.opt[data-id="${w.id}"]`)?.classList.add("right");
    answer(step, w, ok, hint);
  }));
}

const DECOY = "abcdefghiklmnoprstuwy";
function quizSpell(step, w) {
  const isTest = step.type === "test";
  const letters = w.word.split("");                       // 띄어쓰기 포함
  const pos = letters.map((ch, i) => (ch === " " ? -1 : i)).filter((i) => i >= 0); // 글자 칸 위치
  const need = pos.map((i) => letters[i]);
  const decoys = isTest && need.length >= 3
    ? Array.from({ length: 2 }, () => DECOY[Math.floor(Math.random() * DECOY.length)]) : [];
  const tiles = S.shuffle([...need, ...decoys].map((ch) => ({ ch })));
  const slots = Array(need.length).fill(null);              // {tile, fixed}
  let hint = false, answered = false;
  const small = need.length > 7 ? "sm" : "";
  lessonFrame(`<p class="phase">${phaseLabel(step)}</p><p class="prompt">알파벳을 순서대로 눌러요</p>
    <div class="card wordcard" style="padding:16px"><div class="emoji" style="font-size:56px">${w.emoji}</div>
      <div class="meaning">${esc(w.meaning)}</div>
      ${sndBtns("w", "듣기")}</div>
    <div class="slots ${small}" id="slots"></div><div class="tiles ${small}" id="tiles"></div>
    <div class="spell-tools">
      <button class="hint-btn" id="undo">⌫ 지우기</button>
      ${isTest ? "" : `<button class="hint-btn" id="hint">💡 한 글자 보기</button>`}
    </div>`);
  st.L.sayT = setTimeout(() => say(w, "w"), 500);
  bindSnd(w);
  const $s = document.getElementById("slots"), $t = document.getElementById("tiles");
  const draw = () => {
    let k = 0;
    $s.innerHTML = letters.map((ch) => {
      if (ch === " ") return `<span class="slot-gap"></span>`;
      const i = k++, s = slots[i];
      return `<button class="slot ${s?.fixed ? "fixed" : ""} ${!s && slots.findIndex((x) => !x) === i ? "next" : ""}" data-i="${i}">${s ? tiles[s.tile].ch : ""}</button>`;
    }).join("");
    const used = new Set(slots.filter(Boolean).map((s) => s.tile));
    $t.innerHTML = tiles.map((t, i) => `<button class="tile ${used.has(i) ? "used" : ""}" data-t="${i}">${t.ch}</button>`).join("");
  };
  const check = () => {
    if (slots.some((s) => !s) || answered) return;
    answered = true;
    const ok = slots.map((s) => tiles[s.tile].ch).join("") === need.join("");
    document.querySelectorAll(".slot").forEach((el) => el.classList.add(ok ? "good" : "bad"));
    setTimeout(() => answer(step, w, ok, hint), ok ? 250 : 450);
  };
  $t.onclick = (e) => {
    const b = e.target.closest(".tile"); if (!b || answered || b.classList.contains("used")) return;
    const i = slots.findIndex((s) => !s); if (i < 0) return;
    slots[i] = { tile: +b.dataset.t }; draw(); check();
  };
  $s.onclick = (e) => {
    const b = e.target.closest(".slot"); if (!b || answered) return;
    const i = +b.dataset.i; if (slots[i] && !slots[i].fixed) { slots[i] = null; draw(); }
  };
  document.getElementById("undo").onclick = () => {
    if (answered) return;
    for (let i = slots.length - 1; i >= 0; i--) if (slots[i] && !slots[i].fixed) { slots[i] = null; break; }
    draw();
  };
  document.getElementById("hint")?.addEventListener("click", () => {
    if (answered) return;
    hint = true;
    const i = slots.findIndex((s, k) => !s || tiles[s.tile].ch !== need[k]);
    if (i < 0) return;
    if (slots[i]) slots[i] = null;
    const used = new Set(slots.filter(Boolean).map((s) => s.tile));
    let t = tiles.findIndex((x, k) => x.ch === need[i] && !used.has(k));
    if (t < 0) {
      const k = slots.findIndex((s, j) => s && !s.fixed && j !== i && tiles[s.tile].ch === need[i]);
      t = slots[k].tile; slots[k] = null;
    }
    slots[i] = { tile: t, fixed: true }; draw(); check();
  });
  draw();
}

// ── 3부 문장 말하기 테스트: 단어가 들어간 문장을 읽고, 음성이 일치해야 통과 ──
function sentenceParts(w) {
  const sents = (w.example.match(/[^.?!]+[.?!]/g) || [w.example]).map((x) => x.trim());
  const ex = normalize(w.example).split(" ");
  const key = normalize(S.spoken(w)).split(" ")
    // 예문 속 실제 형태로 맞춤 (leg → legs, hurt → hurts)
    .map((k) => ex.find((e) => e === k) || ex.find((e) => e.startsWith(k) && e.length - k.length <= 2)).filter(Boolean).join(" ");
  const keys = key ? [key] : [];
  const has = (x) => keys.every((k) => k.split(" ").every((t) => normalize(x).split(" ").includes(t)));
  return { target: sents.find(has) || sents[0], keys };
}
function quizSentence(step, w) {
  const { target, keys } = sentenceParts(w);
  const key = S.spoken(w);
  const i = target.toLowerCase().indexOf(key.toLowerCase());
  const shown = i >= 0
    ? esc(target.slice(0, i)) + `<b>${esc(target.slice(i, i + key.length))}</b>` + esc(target.slice(i + key.length))
    : esc(target);
  lessonFrame(`<p class="phase">${phaseLabel(step)}</p><p class="prompt">문장을 소리 내어 읽어요</p>
    <div class="card wordcard" style="padding:18px"><div class="emoji" style="font-size:56px">${w.emoji}</div>
      <div class="pattern">${shown}</div><div class="muted" style="font-size:18px">${esc(w.example_ko)}</div>
      ${sndBtns("x", "문장 듣기")}</div>
    <button class="mic" id="mic">🎤</button><div class="stars" id="stars"></div>
    <div class="heard" id="heard">🎤 버튼을 누르고 또박또박 읽어요</div><div id="more" style="margin-top:12px"></div>`);
  bindSnd(w);
  let tries = 0, answered = false;
  const more = document.getElementById("more");
  const giveUp = () => {
    more.innerHTML = `<button class="btn ghost small" id="later">다음에 다시 도전할게요</button>`;
    document.getElementById("later").onclick = () => {
      if (answered) return; answered = true;
      answer(step, w, false, false, { quiet: true });
    };
  };
  document.getElementById("mic").onclick = async () => {
    if (answered) return;
    stopAll();
    const mic = document.getElementById("mic"), stars = document.getElementById("stars"), heard = document.getElementById("heard");
    mic.classList.add("on"); heard.textContent = "듣고 있어요… 읽어 보세요!";
    try {
      const r = scoreSentence(target, await listenOnce({ timeoutMs: 9000 }), keys);
      tries++;
      stars.textContent = "⭐".repeat(r.score) + "☆".repeat(3 - r.score);
      if (r.pass) {
        answered = true;
        heard.textContent = `"${r.transcript}" — 정확해요!`;
        answer(step, w, true, false, { score: 3, transcript: r.transcript, quiet: true });
      } else {
        heard.textContent = `"${r.transcript}" 라고 들렸어요. ${r.missing.length ? `"${r.missing.join(", ")}" 부분을 또렷하게!` : "조금만 더 정확하게!"}`;
        if (tries >= 3) giveUp();
      }
    } catch (e) {
      if (/not-allowed|service-not-allowed|unsupported/.test(e.message)) {
        st.srBroken = true;
        heard.textContent = "마이크(받아쓰기)가 꺼져 있어서 이 문제는 넘어가요";
        more.innerHTML = `<button class="btn small" id="skip">계속</button>`;
        document.getElementById("skip").onclick = () => { if (st.L?.test) st.L.test.total--; nextStep(); };
      } else {
        heard.textContent = "잘 안 들렸어요. 버튼을 누르고 다시 읽어 보세요";
        tries++; if (tries >= 3) giveUp();
      }
    } finally { document.getElementById("mic")?.classList.remove("on"); }
  };
}

// 복습: 뜻 보고 영어로 말하기 (인식 안 되면 플래시카드 자가 체크)
function quizSpeak(step, w) {
  const en = S.spoken(w);
  const selfCheck = !canRecognize || st.srBroken;
  lessonFrame(`<p class="phase">복습 · 말하기</p><p class="prompt">영어로 말해 보세요</p>
    <div class="card wordcard" style="padding:18px"><div class="emoji" style="font-size:64px">${w.emoji}</div>
      <div class="meaning">${esc(w.meaning)}</div><div class="word hidden" id="ans">${esc(en)}</div></div>
    ${selfCheck
      ? `<p class="muted" style="text-align:center;margin:18px 0">소리 내어 말해 본 다음 정답을 확인해요</p>
         <div id="sc"><button class="btn sky" id="reveal">정답 보기</button></div>`
      : `<button class="mic" id="mic">🎤</button><div class="stars" id="stars"></div><div class="heard" id="heard">버튼을 누르고 말해요</div>
         <button class="btn ghost small" id="giveup" style="margin-top:14px">모르겠어요</button>`}`);
  if (selfCheck) {
    document.getElementById("reveal").onclick = () => {
      document.getElementById("ans").classList.remove("hidden");
      say(w, "w");
      document.getElementById("sc").innerHTML = `<div class="stack">
        <button class="btn mint" data-r="correct">맞게 말했어요 😀</button>
        <div class="row"><button class="btn ghost small" data-r="hint">헷갈렸어요 🤔</button>
        <button class="btn ghost small" data-r="wrong">몰랐어요 😅</button></div></div>`;
      document.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => {
        const r = b.dataset.r;
        answer(step, w, r !== "wrong", r === "hint", { quiet: true });
      }));
    };
    return;
  }
  let tries = 0, answered = false;
  document.getElementById("giveup").onclick = () => {
    if (answered) return; answered = true;
    document.getElementById("ans").classList.remove("hidden");
    answer(step, w, false, false);
  };
  document.getElementById("mic").onclick = async () => {
    if (answered) return;
    const mic = document.getElementById("mic"), stars = document.getElementById("stars"), heard = document.getElementById("heard");
    mic.classList.add("on"); heard.textContent = "듣고 있어요…";
    try {
      const r = scoreSpeech(en, await listenOnce());
      tries++;
      stars.textContent = "⭐".repeat(r.score) + "☆".repeat(3 - r.score);
      heard.textContent = `"${r.transcript}" 라고 들렸어요`;
      if (r.score >= 2 || tries >= 2) {
        answered = true;
        document.getElementById("ans").classList.remove("hidden");
        answer(step, w, r.score >= 1, r.score === 1, { score: r.score, transcript: r.transcript });
      } else heard.textContent += " · 한 번 더!";
    } catch (e) {
      if (/not-allowed|service-not-allowed|unsupported/.test(e.message)) { st.srBroken = true; quizSpeak(step, w); return; }
      heard.textContent = "잘 안 들렸어요. 다시 눌러 주세요";
    } finally { document.getElementById("mic")?.classList.remove("on"); }
  };
}

// ═════════════════════════ 채점 · 기록 ═════════════════════════
function record(w, { mode, phase, correct, hint = false, score = null, transcript = null, review = false }) {
  const L = st.L;
  const p = st.progress[w.id];
  const before = p?.box ?? null;
  let after = before;
  if (p && review) {
    const np = S.applyResult(p, correct ? (hint ? "hint" : "correct") : "wrong");
    st.progress[w.id] = np; DB.saveProgress(np); after = np.box;
  } else if (p && mode !== "speak") {
    const np = { ...p, correct_count: p.correct_count + (correct ? 1 : 0), wrong_count: p.wrong_count + (correct ? 0 : 1), last_reviewed_at: S.nowISO() };
    st.progress[w.id] = np; DB.saveProgress(np);
  }
  DB.logAnswer({
    client_id: S.uuid(), session_id: L.session.id, learner_id: DB.learner.id, word_id: w.id, mode, phase,
    is_correct: !!correct, hint_used: !!hint, speak_score: score, transcript,
    box_before: before, box_after: after, answered_at: S.nowISO(),
  });
  L.session.ended_at = S.nowISO();
  saveSess(L.session);
  return { before, after };
}

const PRAISE = ["잘했어요! 🎉", "정답! 👍", "멋져요! ✨", "최고예요! 🌟", "완벽해요! 💯", "천재인데? 🧠", "바로 그거야! 🙌"];
const COMBO = { 3: "3연속 정답! 🔥", 5: "5연속! 멈출 수 없어! 🚀", 7: "7연속! 영어 천재 등장! 👑", 10: "10연속!! 대단해! 🏆" };

function answer(step, w, ok, hint, extra = {}) {
  const L = st.L;
  const phase = step.type === "test" ? "test" : (step.type === "review" || step.type === "quiz") ? "review" : "practice";
  const isReview = step.type === "review" && !step.retry;
  const { before, after } = record(w, { mode: step.mode, phase, correct: ok, hint, review: isReview, ...extra });
  if (isReview) L.session.reviewed_words++;
  if (ok) { L.session.correct++; L.session.xp += step.type === "test" ? 5 : hint ? 1 : 2; }
  saveSess(L.session);
  L.combo = ok && !hint ? (L.combo || 0) + 1 : 0;

  let note = "";
  if (step.type === "test") {
    L.test.results.push({ q: step, ok });
  } else if (step.type === "practice" && (!ok || hint)) {
    // 반복 학습: 틀리거나 힌트를 쓴 단어는 조금 뒤에 다시 나옴 (맞힐 때까지)
    const at = Math.min(L.steps.length, L.i + 4);
    L.steps.splice(at, 0, { ...step, again: true });
    note = ok ? "조금 뒤에 힌트 없이 한 번 더!" : "괜찮아요! 조금 뒤에 다시 나와요";
  } else if (!ok && step.type === "review" && !step.retry) {
    L.steps.push({ type: "quiz", id: w.id, mode: step.mode === "speak" ? "meaning_pick" : step.mode, retry: true });
  }
  ok ? fx("ok") : fx("no");

  let boxMsg = "";
  if (isReview && after !== before) boxMsg = after === S.GRAD_BOX ? " · 졸업! 🎓" : after > before ? ` · 상자 ${after}로 ⬆️` : ` · 상자 ${after}로`;
  const combo = ok && COMBO[L.combo] ? `<div class="combo">${COMBO[L.combo]}</div>` : "";
  const fb = document.createElement("div");
  fb.className = `feedback ${ok ? "ok" : "no"}`;
  fb.innerHTML = `<div class="inner">${combo}<div class="msg">${ok ? (hint ? "힌트로 맞혔어요! 💡" : pick(PRAISE)) : "아쉬워요! 정답은 이거예요"}${boxMsg}</div>
    <div class="ans"><span class="en">${esc(S.spoken(w))}</span> ${w.emoji} ${esc(w.meaning)}</div>
    ${note ? `<div class="muted" style="margin:-6px 0 12px;font-size:18px">${note}</div>` : ""}
    <button class="btn ${ok ? "mint" : ""}" id="cont">계속</button></div>`;
  document.body.appendChild(fb);
  if (!extra.quiet) L.sayT = setTimeout(() => say(w, "w"), 250);
  fb.querySelector("#cont").onclick = () => { stopAll(); nextStep(); };
  // 테스트에서 맞히면 자동으로 다음 문제 (리듬감)
  if (step.type === "test" && ok) L.auto = setTimeout(() => { if (document.body.contains(fb)) { stopAll(); nextStep(); } }, 1400);
}

function finishReviewOnly() {
  const s = st.L.session;
  lessonFrame(`<div class="celebrate"><div class="big">🏆</div><h1>복습 끝!</h1>
    <p class="muted">${esc(callName())}, 정말 잘했어요</p>
    <div class="stat3"><div class="card"><b>${s.reviewed_words}</b><span>복습</span></div>
    <div class="card"><b>${s.correct}</b><span>정답</span></div>
    <div class="card"><b>+${s.xp}</b><span>⭐ 점수</span></div></div>
    <button class="btn" id="home">홈으로</button></div>`);
  fx("win");
  document.getElementById("home").onclick = () => endLesson();
}

function endLesson(navigate = true) {
  stopAll();
  document.querySelector(".feedback")?.remove();
  document.querySelector(".party")?.remove();
  if (st.L) { clearTimeout(st.L.auto); clearTimeout(st.L.sayT); st.L.session.ended_at = S.nowISO(); saveSess(st.L.session); }
  st.L = null;
  DB.flush();
  if (navigate) go("home");
}

// ═════════════════════════ 🎧 듣기 ═════════════════════════
function playlists() {
  const all = Object.values(st.progress);
  const w = (ps) => ps.map((p) => st.byId[p.word_id]).filter(Boolean);
  const weekAgo = S.todayKST(-6);
  const done = passedToday(), cur = currentDay();
  const todayDay = done ? done.day : cur;
  const todayWords = todayDay ? dayWords(todayDay).filter((x) => done || st.progress[x.id]) : [];
  const nextDay = done ? cur : cur && cur + 1 <= lastDay() ? cur + 1 : null;
  return [
    { key: "today", em: "✨", t: todayDay ? `오늘 단어 (Day ${todayDay})` : "오늘 단어", words: todayWords },
    { key: "due", em: "🔁", t: "오늘 복습할 단어", words: w(S.dueList(st.progress, 999)) },
    { key: "week", em: "📅", t: "이번 주 배운 단어", words: w(all.filter((p) => S.kstDate(p.first_learned_at) >= weekAgo)) },
    { key: "weak", em: "💪", t: "자주 틀린 단어", words: w(all.filter((p) => p.wrong_count > 0)
        .sort((a, b) => b.wrong_count / (b.correct_count + b.wrong_count) - a.wrong_count / (a.correct_count + a.wrong_count)).slice(0, 30)) },
    { key: "all", em: "📚", t: "배운 단어 전체", words: w(all), shuffle: true },
    { key: "preview", em: "👀", t: nextDay ? `다음 단어 미리 듣기 (Day ${nextDay})` : "다음 단어 미리 듣기", words: nextDay ? dayWords(nextDay) : [] },
  ];
}

function seg(name, options, cur) {
  return `<div class="seg" data-seg="${name}">${options.map(([v, label]) =>
    `<button data-v="${v}" class="${String(v) === String(cur) ? "on" : ""}">${label}</button>`).join("")}</div>`;
}

function renderListen() {
  const P = st.player, o = st.listen;
  const lists = playlists();
  const sel = lists.find((l) => l.key === o.list) || lists[0];
  const active = P.state !== "idle";
  const cur = P.current;
  const pos = active ? `${P.wordsHeard + 1}번째 단어 · ${Math.floor(P.seconds / 60)}분 들음` : "";
  const mp3 = mp3Count() > 0;

  $app.innerHTML = `${statusbar()}<h1>🎧 듣기 반복</h1>
    <p class="muted" style="margin-bottom:12px">버스·지하철에서 이어폰으로 들어요</p>
    <section class="card now">
      ${cur ? `<div class="emoji">${cur.emoji}</div><div class="word">${esc(S.spoken(cur))}</div><div class="meaning">${esc(cur.meaning)}</div>`
            : `<div class="emoji">🎧</div><div class="muted">아래에서 목록을 고르고 재생해요</div>`}
      <div class="pos">${P.state === "waiting-screen" ? "화면을 켜면 이어서 들려요" : pos}</div>
      <div class="controls">
        <button class="c" id="prev" ${active ? "" : "disabled"}>⏮</button>
        <button class="c play" id="pp">${P.state === "playing" ? "⏸" : "▶"}</button>
        <button class="c" id="nextw" ${active ? "" : "disabled"}>⏭</button>
        ${active ? `<button class="c" id="stop">⏹</button>` : ""}
      </div>
    </section>
    <p class="note ${mp3 ? "blue" : ""}" style="margin-top:12px">${mp3
      ? "🔒 화면을 꺼도 계속 들려요. 잠금화면에서 ⏯ ⏭ 버튼으로 조작할 수 있어요."
      : "⚠️ 음성 파일이 아직 없어서 기기 음성으로 읽어요. 이때는 화면을 켜 두어야 해요."}</p>
    <h2>무엇을 들을까요?</h2>
    <div class="playlist">${lists.map((l) => `<button class="pl ${l.key === sel.key ? "on" : ""}" data-pl="${l.key}" ${l.words.length ? "" : "disabled"}>
      <span class="em">${l.em}</span><span class="t">${l.t}</span><span class="n">${l.words.length}개</span></button>`).join("")}</div>
    <h2>듣는 방법</h2>
    <div class="stack">
      <div class="field"><label>순서</label>${seg("dir", [["ek", "영어 → 뜻"], ["ke", "뜻 → 떠올리기 → 영어"]], o.dir)}</div>
      <div class="field"><label>한 단어 반복</label>${seg("repeat", [[1, "1번"], [2, "2번"], [3, "3번"]], o.repeat)}</div>
      <div class="field"><label>속도</label>${seg("rate", [[0.8, "천천히"], [1, "보통"]], o.rate)}</div>
      <div class="field"><label>예문도 듣기</label>${seg("example", [[false, "단어만"], [true, "예문 포함"]], o.example)}</div>
      <div class="field"><label>자동 끄기</label>${seg("sleepMin", [[0, "없음"], [10, "10분"], [20, "20분"], [30, "30분"]], o.sleepMin)}</div>
      ${mp3 ? `<button class="btn ghost small" id="dl">📥 지하철용 미리 저장 (오프라인)</button>` : ""}
    </div>`;

  document.querySelectorAll("[data-pl]").forEach((b) => (b.onclick = () => { o.list = b.dataset.pl; saveListenOpts(); if (P.state !== "idle") startListening(); else renderListen(); }));
  document.querySelectorAll("[data-seg]").forEach((g) => g.querySelectorAll("button").forEach((b) => (b.onclick = () => {
    const k = g.dataset.seg, v = b.dataset.v;
    o[k] = k === "dir" ? v : k === "example" ? v === "true" : Number(v);
    saveListenOpts();
    if (P.state !== "idle") startListening(); else renderListen();
  })));
  document.getElementById("pp").onclick = () => {
    if (P.state === "playing") P.pause();
    else if (P.state === "paused" || P.state === "waiting-screen") P.resume();
    else startListening();
  };
  document.getElementById("prev").onclick = () => P.skip(-1);
  document.getElementById("nextw").onclick = () => P.skip(1);
  document.getElementById("stop")?.addEventListener("click", () => P.stop());
  document.getElementById("dl")?.addEventListener("click", prefetchAudio);
}
function saveListenOpts() { LSset(DB.k("listenOpts"), st.listen); }

function startListening() {
  const P = st.player, o = st.listen;
  const sel = playlists().find((l) => l.key === o.list);
  if (!sel?.words.length) return toast("이 목록에는 아직 단어가 없어요");
  if (P.state !== "idle") P.stop();
  P.load(sel.words, { dir: o.dir, repeat: o.repeat, rate: o.rate, example: o.example, sleepMin: o.sleepMin, loop: true, shuffle: !!sel.shuffle });
  st.audioSession = newSession("audio");
  saveSess(st.audioSession);
  P.onChange = () => { if (st.tab === "listen" && !st.L) renderListen(); };
  P.onProgress = () => {
    const s = st.audioSession; if (!s) return;
    s.audio_seconds = Math.round(P.seconds); s.audio_words = P.wordsHeard; s.ended_at = S.nowISO();
    saveSess(s);
    if (P.state === "idle") {
      if (P.stopReason === "sleep") toast("자동 끄기 시간이 되어 멈췄어요 😴");
      st.audioSession = null;
    }
  };
  P.start();
}

async function prefetchAudio() {
  const urls = new Set();
  for (const l of playlists()) {
    if (!["today", "due", "week", "preview"].includes(l.key)) continue;
    for (const w of l.words) for (const v of ["w", "x", "ek", "ke", "ex"]) urls.add(mp3Url(w.id, v));
    for (const v of ["ws", "xs"]) urls.add(mp3Url(w.id, v));
  }
  const btn = document.getElementById("dl");
  let n = 0;
  for (const u of urls) {
    try { await fetch(u); } catch {}
    n++; if (btn) btn.textContent = `📥 저장 중… ${n}/${urls.size}`;
  }
  if (btn) btn.textContent = `✅ ${urls.size}개 저장 완료`;
}

// ═════════════════════════ 📚 단어장 ═════════════════════════
function renderWords() {
  const all = Object.values(st.progress);
  const counts = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((b) => [b, all.filter((p) => p.box === b).length]));
  const list = all.filter((p) => p.box === st.wordBox)
    .sort((a, b) => (a.next_due < b.next_due ? -1 : 1)).map((p) => ({ p, w: st.byId[p.word_id] })).filter((x) => x.w);
  const remaining = st.words.filter((x) => !st.progress[x.id]).length;
  $app.innerHTML = `${statusbar()}<h1>📚 내 단어장</h1>
    <p class="muted" style="margin-bottom:14px">맞히면 다음 상자로! 상자 6을 넘으면 졸업 🎓</p>
    <div class="boxes">${[1, 2, 3, 4, 5, 6, 7].map((b) => `<button data-b="${b}" class="${b === st.wordBox ? "on" : ""}" style="border-top:5px solid var(--b${b})">
      <b>${counts[b]}</b>${b === 7 ? "졸업" : "상자" + b}</button>`).join("")}</div>
    <div class="wlist">${list.length ? list.map(({ p, w }) => `<button class="wrow" data-id="${w.id}"><span class="em">${w.emoji}</span>
      <span><div class="w">${esc(S.spoken(w))}</div><div class="m">${esc(w.meaning)}</div></span>
      <span class="bx" style="background:var(--b${p.box})">${p.box === 7 ? "🎓" : p.next_due <= today() ? "오늘" : p.next_due.slice(5).replace("-", "/")}</span></button>`).join("")
      : `<p class="muted" style="text-align:center;padding:30px 0">이 상자는 비어 있어요</p>`}</div>
    <p class="muted" style="text-align:center;margin-top:18px">아직 배우지 않은 단어 ${remaining}개</p>`;
  document.querySelectorAll("[data-b]").forEach((b) => (b.onclick = () => { st.wordBox = +b.dataset.b; renderWords(); }));
  document.querySelectorAll(".wrow").forEach((b) => (b.onclick = () => say(st.byId[b.dataset.id], "ek")));
}

// ═════════════════════════ 🏆 보상 ═════════════════════════
async function renderRewards() {
  const strk = S.streak(dayMap()), xp = totalXP();
  const grads = Object.values(st.progress).filter((p) => p.box === S.GRAD_BOX).map((p) => st.byId[p.word_id]).filter(Boolean);
  const slots = Math.max(12, Math.ceil((grads.length + 1) / 6) * 6);
  const draw = (rewards) => {
    const val = { streak: strk, graduated: grads.length, xp, days: passedDays().length };
    const unit = { streak: "일 연속", graduated: "개 졸업", xp: "점", days: " Day 통과" };
    $app.innerHTML = `${statusbar()}<h1>🏆 보상</h1>
      <section class="stat3"><div class="card"><b>🔥${strk}</b><span>연속 학습일</span></div>
        <div class="card"><b>${passedDays().length}</b><span>통과한 Day</span></div><div class="card"><b>${xp}</b><span>⭐ 점수</span></div></section>
      <h2>부모님과 약속한 보상</h2>
      <div class="stack">${rewards.length ? rewards.map((r) => {
        const v = val[r.condition_type] ?? 0, pct = Math.min(100, Math.round((v / r.target) * 100)), done = v >= r.target || r.achieved_at;
        return `<div class="card goal ${done ? "done" : ""}"><div class="top"><span>${done ? "🎁" : "🎯"} ${esc(r.title)}</span>
          <span class="muted">${Math.min(v, r.target)}/${r.target}${unit[r.condition_type]}</span></div>
          <div class="meter"><i style="width:${done ? 100 : pct}%"></i></div>${done ? `<p style="color:var(--mint-d)">달성! 부모님께 말씀드려요 🎉</p>` : ""}</div>`;
      }).join("") : `<p class="note">아직 보상이 없어요. 부모님께 목표를 정해 달라고 해요!</p>`}</div>
      <h2>졸업 스티커 🎓 ${grads.length}개</h2>
      <div class="card"><div class="sticker-wall">${Array.from({ length: slots }, (_, i) =>
        grads[i] ? `<span title="${esc(grads[i].word)}">${grads[i].emoji}</span>` : `<span class="empty">?</span>`).join("")}</div></div>
      <p style="text-align:center;margin:28px 0 8px"><a href="parent.html" class="muted" style="font-size:17px">👨‍👩‍👦 부모님 화면</a></p>`;
  };
  draw(DB.mode === "local" ? await DB.loadRewards() : LSget(DB.k("rewards"), []));
  if (DB.mode === "cloud") { const r = await DB.loadRewards(); if (st.tab === "rewards") draw(r); }
}

boot();
