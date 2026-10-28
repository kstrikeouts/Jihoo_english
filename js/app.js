// 지후 English — 학생 앱
import { CONFIG } from "./config.js";
import { DB } from "./db.js";
import * as S from "./srs.js";
import { say, sayText, stopAll, fx, ListenPlayer, loadAudioManifest, mp3Count } from "./audio.js";
import { canRecognize, listenOnce, scoreSpeech } from "./speech.js";
import { ask } from "./ui.js";

const $app = document.getElementById("app");
const $tabs = document.getElementById("tabs");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LSget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const LSset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const st = {
  words: [], byId: {}, progress: {}, sessions: [], tab: "home",
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
  const files = CONFIG.WORD_FILES;
  const [lists] = await Promise.all([
    Promise.all(files.map((f) => fetch(f).then((r) => r.json()))),
    loadAudioManifest(),
  ]);
  st.words = lists.flatMap((l) => l.words);
  st.byId = Object.fromEntries(st.words.map((w) => [w.id, w]));
  st.progress = await DB.loadProgress();
  st.sessions = await DB.loadSessions();
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
const learnedToday = () => S.learnedOn(st.progress, today());
const target = () => DB.learner.daily_new_target || CONFIG.DAILY_NEW;
const speakKey = () => DB.k(`speak.${today()}`);
const syncText = () => DB.mode === "local" ? "📱 체험 모드" : DB.pending() ? `☁️ 전송 대기 ${DB.pending()}` : "☁️ 저장됨";

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

// ═════════════════════════ 탭 ═════════════════════════
function go(tab) {
  st.tab = tab;
  if (tab !== "listen" && st.player.state === "idle") stopAll();
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

// ── 홈 ───────────────────────────────────────────
function renderHome() {
  const due = S.dueList(st.progress, CONFIG.REVIEW_CAP).length;
  const doneNew = learnedToday().length;
  const remainingWords = S.nextNewWords(st.words, st.progress, 9999).length;
  const newLeft = Math.min(Math.max(0, target() - doneNew), remainingWords);
  const speakDone = !!LSget(speakKey(), false);
  const needSpeak = !speakDone && (doneNew > 0 || newLeft > 0);
  const allDone = due === 0 && newLeft === 0 && !needSpeak;
  const all = Object.values(st.progress);
  const grad = all.filter((p) => p.box === S.GRAD_BOX).length;
  const tomorrow = all.filter((p) => p.box < S.GRAD_BOX && p.next_due <= S.todayKST(1)).length;
  const lv = S.levelOf(totalXP());

  $app.innerHTML = `${statusbar()}
    <h1>${esc(callName())}, 안녕! 👋</h1>
    <p class="muted">레벨 ${lv} · 다음 레벨까지 ⭐ ${lv * 200 - totalXP()}</p>
    <section class="card mission">
      <p style="font-size:19px">${allDone ? "오늘 미션 완료! 🎉" : "오늘의 미션"}</p>
      <ul class="steps">
        <li class="${due === 0 ? "done" : ""}"><span class="ic">🔁</span>복습하기<span class="num">${due ? due + "개" : ""}</span></li>
        <li class="${newLeft === 0 ? "done" : ""}"><span class="ic">✨</span>새 단어 배우기<span class="num">${doneNew}/${target()}</span></li>
        <li class="${needSpeak ? "" : "done"}"><span class="ic">🎤</span>말하기 미션<span class="num"></span></li>
      </ul>
      ${allDone
        ? `<button class="btn sky" id="toListen">🎧 듣기로 한 번 더 복습</button>`
        : `<button class="btn" id="startL">오늘 학습 시작 ▶</button>`}
    </section>
    <section class="stat3">
      <div class="card"><b>${all.length}</b><span>배운 단어</span></div>
      <div class="card"><b>${grad}</b><span>졸업 🎓</span></div>
      <div class="card"><b>${tomorrow}</b><span>내일 복습</span></div>
    </section>
    ${remainingWords === 0 ? `<p class="note">단어장의 단어를 모두 배웠어요! 부모님께 새 단어장을 부탁해요 📚</p>` : ""}`;
  document.getElementById("startL")?.addEventListener("click", startLesson);
  document.getElementById("toListen")?.addEventListener("click", () => go("listen"));
}

// ═════════════════════════ 학습 ═════════════════════════
const spellable = (w) => w.type === "word" && /^[a-z]+$/.test(w.word) && w.word.length <= 8;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function reviewMode(p, w) {
  const opts = p.box <= 2 ? ["listen_pick", "meaning_pick"]
    : p.box <= 4 ? (spellable(w) ? ["spell", "meaning_pick"] : ["meaning_pick", "speak"])
    : ["speak", spellable(w) ? "spell" : "meaning_pick"];
  return pick(opts);
}

function startLesson() {
  const due = S.dueList(st.progress, CONFIG.REVIEW_CAP);
  const doneNew = learnedToday();
  const fresh = S.nextNewWords(st.words, st.progress, target() - doneNew.length);
  const speakDone = !!LSget(speakKey(), false);
  const steps = [];

  if (due.length) {
    steps.push({ type: "phase", emoji: "🔁", title: "복습 시간", sub: `전에 배운 단어 ${due.length}개를 다시 만나요` });
    S.shuffle(due).forEach((p) => { const w = st.byId[p.word_id]; if (w) steps.push({ type: "review", id: w.id, mode: reviewMode(p, w) }); });
  }
  if (fresh.length) {
    steps.push({ type: "phase", emoji: "✨", title: "새 단어 " + fresh.length + "개", sub: "잘 듣고, 따라 말해 봐요" });
    fresh.forEach((w) => steps.push({ type: "intro", id: w.id }));
    S.shuffle(fresh).forEach((w) => steps.push({ type: "quiz", id: w.id, mode: "listen_pick" }));
    S.shuffle(fresh).forEach((w) => steps.push({ type: "quiz", id: w.id, mode: "meaning_pick" }));
    S.shuffle(fresh.filter(spellable)).forEach((w) => steps.push({ type: "quiz", id: w.id, mode: "spell" }));
  }
  if (!speakDone && (fresh.length || doneNew.length)) {
    const pool = (fresh.length ? fresh : doneNew.map((p) => st.byId[p.word_id])).filter(Boolean);
    const chosen = S.shuffle(pool).slice(0, 2);
    if (chosen.length) {
      steps.push({ type: "phase", emoji: "🎤", title: "말하기 미션", sub: "문장으로 말해 봐요" });
      chosen.forEach((w) => steps.push({ type: "chunk", id: w.id }));
    }
  }
  if (!steps.length) return renderHome();
  steps.push({ type: "done" });

  st.L = { steps, i: 0, session: newSession(fresh.length ? "lesson" : "review"), retried: new Set(), newCount: fresh.length };
  saveSess(st.L.session);
  $tabs.classList.add("hidden");
  $app.className = "app focus";
  renderStep();
}

function lessonFrame(inner) {
  const L = st.L;
  const pct = Math.round((L.i / (L.steps.length - 1)) * 100);
  $app.innerHTML = `<div class="lesson-top"><button class="x-btn" id="quit" aria-label="그만하기">✕</button>
    <div class="bar"><i style="width:${pct}%"></i></div></div><div id="stage">${inner}</div>`;
  document.getElementById("quit").onclick = async () => {
    if (await ask("그만할까요? 지금까지 한 것은 저장돼요.", "그만하기", "계속하기")) endLesson(false);
  };
}

function nextStep() {
  document.querySelector(".feedback")?.remove();
  st.L.i++;
  renderStep();
}

function renderStep() {
  const step = st.L.steps[st.L.i];
  const w = st.byId[step.id];
  ({ phase: stepPhase, intro: stepIntro, quiz: stepQuiz, review: stepQuiz, chunk: stepChunk, done: stepDone })[step.type](step, w);
}

function stepPhase(step) {
  lessonFrame(`<div class="celebrate"><div class="big">${step.emoji}</div><h1>${esc(step.title)}</h1>
    <p class="muted" style="margin:6px 0 28px">${esc(step.sub)}</p><button class="btn" id="go">시작!</button></div>`);
  document.getElementById("go").onclick = nextStep;
}

// ── 새 단어 소개 ──
function stepIntro(step, w) {
  // 처음 보는 순간 진도에 등록 → 중간에 그만둬도 내일 복습에 나옴
  if (!st.progress[w.id]) {
    const p = S.newProgress(DB.learner.id, w.id);
    st.progress[w.id] = p; DB.saveProgress(p);
    st.L.session.new_words++; st.L.session.xp += 10; saveSess(st.L.session);
  }
  const en = S.spoken(w);
  lessonFrame(`<p class="phase">새 단어</p>
    <div class="card wordcard">
      <div class="emoji">${w.emoji}</div>
      <div class="word ${en.length > 12 ? "long" : ""}">${esc(en)}</div>
      <div class="meaning">${esc(w.meaning)}</div>
      <div style="margin-top:14px"><button class="speaker" id="spk">🔊</button></div>
      <div class="ex"><div class="en">${esc(w.example)}</div><div class="ko">${esc(w.example_ko)}</div></div>
    </div>
    <div class="stars" id="stars" style="margin-top:10px"></div><div class="heard" id="heard"></div>
    <div class="row" style="margin-top:8px">
      <button class="btn ghost" id="mic">🎤 따라하기</button>
      <button class="btn" id="go">다음 ▶</button></div>`);
  const play = () => say(w, "w").then(() => st.L?.steps[st.L.i] === step && say(w, "x"));
  play();
  document.getElementById("spk").onclick = play;
  document.getElementById("go").onclick = () => { stopAll(); nextStep(); };
  document.getElementById("mic").onclick = () => speakAttempt(w, en, "speak", false);
}

// 말하기 공통 — 인식이 되면 별점, 안 되면 스스로 체크
async function speakAttempt(w, targetText, mode, affectsProgress) {
  const stars = document.getElementById("stars"), heard = document.getElementById("heard"), mic = document.getElementById("mic");
  if (!canRecognize || st.srBroken) {
    stars.textContent = "👏"; heard.textContent = "소리 내어 말해 봤죠? 잘했어요!";
    return null;
  }
  stopAll();
  mic.classList.add("on"); heard.textContent = "듣고 있어요… 말해 보세요!";
  try {
    const alts = await listenOnce();
    const r = scoreSpeech(targetText, alts);
    stars.textContent = "⭐".repeat(r.score) + "☆".repeat(3 - r.score);
    heard.textContent = `"${r.transcript}" 라고 들렸어요`;
    record(w, { mode, correct: r.score >= 2, score: r.score, transcript: r.transcript, affectsProgress });
    if (r.score >= 2) fx("ok");
    return r;
  } catch (e) {
    if (/not-allowed|service-not-allowed|unsupported/.test(e.message)) {
      st.srBroken = true;
      heard.textContent = "마이크/받아쓰기가 꺼져 있어요. 소리 내어 말해 보기만 해도 돼요!";
    } else heard.textContent = "잘 안 들렸어요. 한 번 더 눌러 볼까요?";
    return null;
  } finally { mic.classList.remove("on"); }
}

// ── 퀴즈 (새 단어 연습 + 복습) ──
function distractors(w, n = 3) {
  const same = st.words.filter((x) => x.id !== w.id && x.type === w.type);
  const other = st.words.filter((x) => x.id !== w.id && x.type !== w.type);
  const sameTheme = S.shuffle(same.filter((x) => x.theme === w.theme)).slice(0, 1);
  const out = [];
  for (const x of [...sameTheme, ...S.shuffle(same), ...S.shuffle(other)]) {
    if (out.length >= n) break;
    if ([w, ...out].some((y) => y.emoji === x.emoji || y.meaning === x.meaning || S.spoken(y) === S.spoken(x))) continue;
    out.push(x);
  }
  return out;
}

function stepQuiz(step, w) {
  const mode = step.mode;
  if (mode === "spell") return quizSpell(step, w);
  if (mode === "speak") return quizSpeak(step, w);
  const opts = S.shuffle([w, ...distractors(w)]);
  const listen = mode === "listen_pick";
  const head = listen
    ? `<p class="prompt">잘 듣고 알맞은 것을 골라요</p>
       <div style="text-align:center;margin-bottom:22px"><button class="speaker big" id="spk">🔊</button></div>`
    : `<p class="prompt">영어로 뭐라고 할까요?</p>
       <div class="card wordcard" style="padding:18px;margin-bottom:18px"><div class="emoji" style="font-size:64px">${w.emoji}</div>
       <div class="meaning">${esc(w.meaning)}</div></div>`;
  const optHtml = opts.map((o) => listen
    ? `<button class="opt" data-id="${o.id}"><span class="em">${o.emoji}</span>${esc(o.meaning)}</button>`
    : `<button class="opt en" data-id="${o.id}">${esc(S.spoken(o))}</button>`).join("");
  lessonFrame(`<p class="phase">${step.type === "review" ? "복습" : "연습"}${step.retry ? " · 다시 도전" : ""}</p>${head}
    <div class="options ${!listen && opts.some((o) => S.spoken(o).length > 14) ? "one-col" : ""}">${optHtml}</div>
    <div style="text-align:center;margin-top:18px"><button class="hint-btn" id="hint">💡 힌트</button></div>`);

  let hint = false, answered = false;
  if (listen) { say(w, "w"); document.getElementById("spk").onclick = () => say(w, "w"); }
  document.getElementById("hint").onclick = (e) => {
    hint = true; e.currentTarget.remove();
    S.shuffle([...document.querySelectorAll(".opt")].filter((b) => b.dataset.id !== w.id)).slice(0, 2).forEach((b) => b.classList.add("gone"));
  };
  document.querySelectorAll(".opt").forEach((b) => (b.onclick = () => {
    if (answered) return; answered = true;
    const ok = b.dataset.id === w.id;
    b.classList.add(ok ? "right" : "wrong");
    if (!ok) document.querySelector(`.opt[data-id="${w.id}"]`)?.classList.add("right");
    answer(step, w, ok, hint);
  }));
}

function quizSpell(step, w) {
  const letters = w.word.split("");
  const tiles = S.shuffle(letters.map((ch, i) => ({ ch, i })));
  const slots = Array(letters.length).fill(null); // {tile, fixed}
  let hint = false, answered = false;
  lessonFrame(`<p class="phase">${step.type === "review" ? "복습" : "연습"} · 철자</p><p class="prompt">글자를 순서대로 눌러요</p>
    <div class="card wordcard" style="padding:16px"><div class="emoji" style="font-size:56px">${w.emoji}</div>
      <div class="meaning">${esc(w.meaning)}</div>
      <div style="margin-top:10px"><button class="speaker" id="spk">🔊</button></div></div>
    <div class="slots" id="slots"></div><div class="tiles" id="tiles"></div>
    <div style="text-align:center;margin-top:20px"><button class="hint-btn" id="hint">💡 한 글자 보기</button></div>`);
  say(w, "w");
  document.getElementById("spk").onclick = () => say(w, "w");
  const $s = document.getElementById("slots"), $t = document.getElementById("tiles");
  const draw = () => {
    $s.innerHTML = slots.map((s, i) => `<button class="slot ${s?.fixed ? "fixed" : ""}" data-i="${i}">${s ? tiles[s.tile].ch : ""}</button>`).join("");
    const used = new Set(slots.filter(Boolean).map((s) => s.tile));
    $t.innerHTML = tiles.map((t, i) => `<button class="tile ${used.has(i) ? "used" : ""}" data-t="${i}">${t.ch}</button>`).join("");
  };
  const check = () => {
    if (slots.some((s) => !s) || answered) return;
    answered = true;
    const ok = slots.map((s) => tiles[s.tile].ch).join("") === w.word;
    answer(step, w, ok, hint);
  };
  $t.onclick = (e) => {
    const b = e.target.closest(".tile"); if (!b || answered) return;
    const i = slots.findIndex((s) => !s); if (i < 0) return;
    slots[i] = { tile: +b.dataset.t }; draw(); check();
  };
  $s.onclick = (e) => {
    const b = e.target.closest(".slot"); if (!b || answered) return;
    const i = +b.dataset.i; if (slots[i] && !slots[i].fixed) { slots[i] = null; draw(); }
  };
  document.getElementById("hint").onclick = () => {
    if (answered) return;
    hint = true;
    const i = slots.findIndex((s, k) => !s || tiles[s.tile].ch !== letters[k]);
    if (i < 0) return;
    // i 번째 칸에 맞는 글자를 고정 (다른 칸에 쓰인 같은 글자 타일은 비움)
    const used = new Set(slots.filter(Boolean).map((s) => s.tile));
    let t = tiles.findIndex((x, k) => x.ch === letters[i] && !used.has(k));
    if (t < 0) {
      const k = slots.findIndex((s, j) => s && !s.fixed && j !== i && tiles[s.tile].ch === letters[i]);
      t = slots[k].tile; slots[k] = null;
    }
    slots[i] = { tile: t, fixed: true }; draw(); check();
  };
  draw();
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
      const alts = await listenOnce();
      const r = scoreSpeech(en, alts);
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

// ── 말하기 미션 (문장) ──
function stepChunk(step, w) {
  const target = (w.example.match(/^[^.?!]+[.?!]/) || [w.example])[0];
  const key = S.spoken(w).replace(/[.?!]$/, "");
  const shown = esc(target).replace(esc(key), `<b>${esc(key)}</b>`);
  lessonFrame(`<p class="phase">말하기 미션</p><p class="prompt">이 문장을 말해 보세요</p>
    <div class="card wordcard" style="padding:18px"><div class="emoji" style="font-size:56px">${w.emoji}</div>
      <div class="pattern">${shown}</div><div class="muted">${esc(w.example_ko)}</div>
      <div style="margin-top:12px"><button class="speaker" id="spk">🔊</button></div></div>
    <button class="mic" id="mic">🎤</button><div class="stars" id="stars"></div><div class="heard" id="heard">먼저 듣고, 버튼을 눌러 말해요</div>
    <button class="btn" id="go" style="margin-top:12px">다음 ▶</button>`);
  const play = () => sayText(target);
  play();
  document.getElementById("spk").onclick = play;
  document.getElementById("mic").onclick = async () => {
    const r = await speakAttempt(w, target, "chunk_speak", false);
    if (r === null && (!canRecognize || st.srBroken)) record(w, { mode: "chunk_speak", correct: true, affectsProgress: false });
    if (r && r.score >= 1) { st.L.session.xp += r.score * 2; saveSess(st.L.session); }
    LSset(speakKey(), true);
  };
  document.getElementById("go").onclick = () => { LSset(speakKey(), true); stopAll(); nextStep(); };
}

// ── 결과 기록 ──
function record(w, { mode, correct, hint = false, score = null, transcript = null, affectsProgress, review = false }) {
  const L = st.L;
  const p = st.progress[w.id];
  const before = p?.box ?? null;
  let after = before;
  if (p && review) {
    const np = S.applyResult(p, correct ? (hint ? "hint" : "correct") : "wrong");
    st.progress[w.id] = np; DB.saveProgress(np); after = np.box;
  } else if (p && affectsProgress) {
    const np = { ...p, correct_count: p.correct_count + (correct ? 1 : 0), wrong_count: p.wrong_count + (correct ? 0 : 1), last_reviewed_at: S.nowISO() };
    st.progress[w.id] = np; DB.saveProgress(np);
  }
  DB.logAnswer({
    client_id: S.uuid(), session_id: L.session.id, learner_id: DB.learner.id, word_id: w.id, mode,
    is_correct: !!correct, hint_used: !!hint, speak_score: score, transcript,
    box_before: before, box_after: after, answered_at: S.nowISO(),
  });
  L.session.ended_at = S.nowISO();
  saveSess(L.session);
  return { before, after };
}

const PRAISE = ["잘했어요! 🎉", "정답! 👍", "멋져요! ✨", "최고예요! 🌟", "완벽해요! 💯"];
function answer(step, w, ok, hint, extra = {}) {
  const L = st.L;
  const isReview = step.type === "review" && !step.retry;
  const { before, after } = record(w, { mode: step.mode, correct: ok, hint, review: isReview, affectsProgress: !step.retry, ...extra });
  if (isReview) L.session.reviewed_words++;
  if (ok) { L.session.correct++; L.session.xp += hint ? 3 : 5; }
  saveSess(L.session);
  // 틀린 문제는 마지막에 한 번 더 (기록은 남기되 상자는 이미 반영됨)
  if (!ok && !step.retry && !L.retried.has(w.id + step.mode)) {
    L.retried.add(w.id + step.mode);
    const mode = step.mode === "speak" ? "meaning_pick" : step.mode;
    L.steps.splice(L.steps.length - 1, 0, { type: "quiz", id: w.id, mode, retry: true });
  }
  ok ? fx("ok") : fx("no");
  let boxMsg = "";
  if (isReview && after !== before) boxMsg = after === S.GRAD_BOX ? " · 졸업! 🎓" : after > before ? ` · 상자 ${after}로 ⬆️` : ` · 상자 ${after}로`;
  const fb = document.createElement("div");
  fb.className = `feedback ${ok ? "ok" : "no"}`;
  fb.innerHTML = `<div class="inner"><div class="msg">${ok ? (hint ? "힌트로 맞혔어요! 💡" : pick(PRAISE)) : "아쉬워요! 다시 기억해요"}${boxMsg}</div>
    <div class="ans"><span class="en">${esc(S.spoken(w))}</span> ${w.emoji} ${esc(w.meaning)}</div>
    <button class="btn ${ok ? "mint" : ""}" id="cont">계속</button></div>`;
  document.body.appendChild(fb);
  if (!extra.quiet) setTimeout(() => say(w, "w"), 250);
  fb.querySelector("#cont").onclick = () => { stopAll(); nextStep(); };
}

function stepDone() {
  const s = st.L.session;
  lessonFrame(`<div class="celebrate"><div class="big">🏆</div><h1>오늘 학습 끝!</h1>
    <p class="muted">${esc(callName())}, 정말 잘했어요</p>
    <div class="stat3"><div class="card"><b>${s.new_words}</b><span>새 단어</span></div>
    <div class="card"><b>${s.reviewed_words}</b><span>복습</span></div>
    <div class="card"><b>+${s.xp}</b><span>⭐ 점수</span></div></div>
    <div class="stack"><button class="btn" id="home">홈으로</button>
    <button class="btn ghost" id="lis">🎧 오늘 단어 듣기</button></div></div>`);
  fx("win");
  endLesson(true, false);
  document.getElementById("home").onclick = () => go("home");
  document.getElementById("lis").onclick = () => { st.listen.list = "today"; go("listen"); };
}

function endLesson(finished, navigate = true) {
  stopAll();
  document.querySelector(".feedback")?.remove();
  if (st.L) { st.L.session.ended_at = S.nowISO(); saveSess(st.L.session); }
  st.L = null;
  DB.flush();
  if (navigate) go("home");
}

// ═════════════════════════ 🎧 듣기 ═════════════════════════
function playlists() {
  const all = Object.values(st.progress);
  const w = (ps) => ps.map((p) => st.byId[p.word_id]).filter(Boolean);
  const weekAgo = S.todayKST(-6);
  return [
    { key: "today", em: "✨", t: "오늘 배운 단어", words: w(learnedToday()) },
    { key: "due", em: "🔁", t: "오늘 복습할 단어", words: w(S.dueList(st.progress, 999)) },
    { key: "week", em: "📅", t: "이번 주 배운 단어", words: w(all.filter((p) => S.kstDate(p.first_learned_at) >= weekAgo)) },
    { key: "weak", em: "💪", t: "자주 틀린 단어", words: w(all.filter((p) => p.wrong_count > 0)
        .sort((a, b) => b.wrong_count / (b.correct_count + b.wrong_count) - a.wrong_count / (a.correct_count + a.wrong_count)).slice(0, 30)) },
    { key: "all", em: "📚", t: "배운 단어 전체", words: w(all), shuffle: true },
    { key: "preview", em: "👀", t: "내일 배울 단어 미리 듣기", words: S.nextNewWords(st.words, st.progress, target()) },
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
    for (const w of l.words) for (const v of ["w", "x", "ek", "ke", "ex"]) urls.add(`audio/${w.id}_${v}.mp3`);
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
  const remaining = S.nextNewWords(st.words, st.progress, 9999).length;
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
    const val = { streak: strk, graduated: grads.length, xp };
    const unit = { streak: "일 연속", graduated: "개 졸업", xp: "점" };
    $app.innerHTML = `${statusbar()}<h1>🏆 보상</h1>
      <section class="stat3"><div class="card"><b>🔥${strk}</b><span>연속 학습일</span></div>
        <div class="card"><b>${S.levelOf(xp)}</b><span>레벨</span></div><div class="card"><b>${xp}</b><span>⭐ 점수</span></div></section>
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
      <p style="text-align:center;margin:28px 0 8px"><a href="parent.html" class="muted" style="font-size:14px">👨‍👩‍👦 부모님 화면</a></p>`;
  };
  draw(DB.mode === "local" ? await DB.loadRewards() : LSget(DB.k("rewards"), []));
  if (DB.mode === "cloud") { const r = await DB.loadRewards(); if (st.tab === "rewards") draw(r); }
}

boot();
