// 지후 English — 부모 대시보드
import { CONFIG } from "./config.js";
import { DB } from "./db.js";
import * as S from "./srs.js";
import { ask, notice } from "./ui.js";
const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };

const $app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MODE = { listen_pick: "듣고 고르기", meaning_pick: "뜻 보고 고르기", spell: "철자", speak: "뜻 보고 말하기", chunk_speak: "문장 말하기" };
const QUIZ = new Set(["listen_pick", "meaning_pick", "spell", "speak"]);
const KIND = { lesson: "학습", review: "복습", audio: "🎧 듣기", speaking: "말하기", boss: "보스전" };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
let D = null;

// ── 날짜 유틸 (KST) ──
const kst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3);
const md = (dateStr) => `${+dateStr.slice(5, 7)}/${+dateStr.slice(8, 10)}`;
const dow = (dateStr) => DOW[new Date(dateStr + "T00:00:00Z").getUTCDay()];
function weekStart(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const mins = (sec) => Math.round(sec / 60);
const fmtMin = (sec) => { const m = mins(sec); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

// ═════════════════════════ 시작 ═════════════════════════
async function boot() {
  await DB.init();
  if (DB.needsLogin()) return login();
  await load();
}

function login() {
  $app.innerHTML = `<div class="login stack" style="max-width:420px;margin:0 auto">
    <div class="logo">👨‍👩‍👦</div><h1>부모님 로그인</h1>
    <input class="input" id="em" type="email" autocomplete="username" placeholder="이메일">
    <input class="input" id="pw" type="password" autocomplete="current-password" placeholder="비밀번호">
    <div class="err" id="err"></div><button class="btn" id="go">로그인</button></div>`;
  document.getElementById("go").onclick = async () => {
    try { await DB.signIn(document.getElementById("em").value.trim(), document.getElementById("pw").value); await load(); }
    catch (e) { document.getElementById("err").textContent = e.message; }
  };
}

async function load() {
  try { await DB.loadLearner(); } catch (e) { $app.innerHTML = `<p class="err" style="padding-top:30vh">${esc(e.message)}</p>`; return; }
  const words = (await Promise.all(CONFIG.WORD_FILES.map((f) => fetch(f).then((r) => r.json())))).flatMap((l) => l.words);
  const [progress, sessions, answers, rewards, days] = await Promise.all([
    DB.loadProgress(), DB.loadSessions(), DB.loadAnswers(120), DB.loadRewards(), DB.loadDays()]);
  D = { words, sched: S.buildSchedule(words), byId: Object.fromEntries(words.map((w) => [w.id, w])), progress, sessions, answers, rewards, days, loadedAt: new Date() };
  const pin = DB.learner.parent_pin;
  if (pin && ss.get("je.pin") !== pin) return pinGate(pin);
  render();
}

function pinGate(pin) {
  $app.innerHTML = `<div class="login stack" style="max-width:360px;margin:0 auto"><div class="logo">🔐</div>
    <h1>부모님 비밀번호</h1><input class="input" id="pin" type="password" inputmode="numeric" maxlength="4" placeholder="숫자 4자리" style="text-align:center;font-size:24px;letter-spacing:8px">
    <div class="err" id="err"></div><button class="btn" id="go">확인</button>
    <a href="index.html" class="muted" style="text-align:center;font-size:14px">← 학습 화면으로</a></div>`;
  const ok = () => {
    if (document.getElementById("pin").value === pin) { ss.set("je.pin", pin); render(); }
    else document.getElementById("err").textContent = "비밀번호가 달라요";
  };
  document.getElementById("go").onclick = ok;
  document.getElementById("pin").onkeyup = (e) => { if (e.target.value.length === 4) ok(); };
}

// ═════════════════════════ 집계 ═════════════════════════
function aggregate() {
  const days = {};
  const day = (d) => (days[d] ||= { active: 0, audio: 0, newW: 0, revW: 0, xp: 0 });
  for (const s of D.sessions) {
    const d = day(S.kstDate(s.started_at));
    if (s.kind === "audio") d.audio += s.audio_seconds || 0;
    else d.active += Math.min(7200, Math.max(0, (new Date(s.ended_at || s.started_at) - new Date(s.started_at)) / 1000));
    d.newW += s.new_words || 0; d.revW += s.reviewed_words || 0; d.xp += s.xp || 0;
  }
  return days;
}

function render() {
  const days = aggregate();
  const today = S.todayKST();
  const thisWeek = weekStart(today), lastWeek = S.addDays(thisWeek, -7);
  const inWeek = (d, w) => d >= w && d < S.addDays(w, 7);
  const sumWeek = (w, k) => Object.entries(days).filter(([d]) => inWeek(d, w)).reduce((a, [, v]) => a + v[k], 0);
  const studied = Object.entries(days).filter(([d, v]) => inWeek(d, thisWeek) && S.countsAsStudy({ active: v.newW + v.revW, audio: v.audio })).length;
  const prog = Object.values(D.progress);
  const grad = prog.filter((p) => p.box === S.GRAD_BOX).length;
  const quizIn = (w) => D.answers.filter((a) => QUIZ.has(a.mode) && inWeek(S.kstDate(a.answered_at), w));
  const accNow = (() => { const q = quizIn(thisWeek); return pct(q.filter((a) => a.is_correct).length, q.length); })();
  const accPrev = (() => { const q = quizIn(lastWeek); return pct(q.filter((a) => a.is_correct).length, q.length); })();
  const streak = S.streak(S.studyDates(D.sessions));
  const due = S.dueList(D.progress, 999).length;
  const L = DB.learner;
  const passedN = Object.values(D.days).filter((r) => r.status === "passed").length;
  const lastDay = D.sched.length;
  const testQ = D.answers.filter((a) => a.phase === "test" && inWeek(S.kstDate(a.answered_at), thisWeek));

  $app.innerHTML = `
    <div class="head"><h1>${esc(L.name)} 학습 현황</h1><a href="index.html">학습 화면 →</a></div>
    <p class="muted" style="font-size:13px">${DB.mode === "local" ? "📱 체험 모드 — 이 기기에 저장된 기록만 보여요" : "☁️ " + esc(DB.user?.email || "")} ·
      ${D.loadedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준 <button id="refresh" style="color:var(--sky-d)">새로고침</button></p>

    ${todayBanner(today, lastDay)}

    <h2>한눈에 보기</h2>
    <div class="kpis">
      <div class="card kpi"><span>연속 학습일</span><b>🔥 ${streak}일</b><em>주 1회 쉬어도 유지</em></div>
      <div class="card kpi"><span>이번 주 학습한 날</span><b>${studied}<small style="font-size:16px"> / 7일</small></b><em>오늘 복습 대기 ${due}개</em></div>
      <div class="card kpi"><span>이번 주 학습 시간</span><b>${fmtMin(sumWeek(thisWeek, "active"))}</b><em>지난주 ${fmtMin(sumWeek(lastWeek, "active"))}</em></div>
      <div class="card kpi"><span>이번 주 듣기 시간</span><b>${fmtMin(sumWeek(thisWeek, "audio"))}</b><em>지난주 ${fmtMin(sumWeek(lastWeek, "audio"))}</em></div>
      <div class="card kpi"><span>통과한 Day</span><b>${passedN}<small style="font-size:16px"> / ${lastDay}</small></b><em>배운 단어 ${prog.length}개 · 졸업 ${grad}개</em></div>
      <div class="card kpi"><span>이번 주 정답률</span><b>${accNow == null ? "–" : accNow + "%"}</b><em>테스트만 ${testQ.length ? pct(testQ.filter((a) => a.is_correct).length, testQ.length) + "%" : "–"} · 지난주 ${accPrev == null ? "–" : accPrev + "%"}</em></div>
    </div>

    <h2>주간 학습 시간 <small>최근 8주 · 막대를 누르면 상세</small></h2>
    <div class="card">${weeklyChart(days, thisWeek)}</div>

    <h2>학습 달력 <small>최근 12주</small></h2>
    <div class="card">${calendar(days, today)}</div>

    <h2>Day 진도 <small>학습 5일 + 복습 Day 1일 · 테스트를 모두 맞혀야 통과</small></h2>
    <div class="card">${dayTable(lastDay)}</div>

    <h2>단어 진도 <small>상자가 높을수록 오래 기억</small></h2>
    <div class="card">${boxBars(prog)}</div>

    <h2>자주 틀리는 단어 TOP 10</h2>
    <div class="card">${weakTable(prog)}</div>

    <h2>발음 점수 <small>주별 평균 · 최대 ⭐3</small></h2>
    <div class="card">${speakChart(thisWeek)}</div>

    <h2>최근 학습 기록</h2>
    <div class="card">${sessionTable()}</div>

    <h2>최근 틀린 문제</h2>
    <div class="card">${wrongTable()}</div>

    <h2>보상 약속</h2>
    <div class="card">${rewardsBlock(streak, grad)}</div>

    <h2>설정</h2>
    <div class="card stack">${settingsBlock()}</div>`;

  bind();
}

// ═════════════════════════ 차트 ═════════════════════════
function niceMax(v) {
  for (const s of [10, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600]) if (v <= s) return s;
  return Math.ceil(v / 60) * 60;
}
function topRounded(x, y, w, h, r = 4) {
  if (h <= 0) return "";
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function weeklyChart(days, thisWeek) {
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = S.addDays(thisWeek, -7 * (7 - i));
    let active = 0, audio = 0;
    for (let k = 0; k < 7; k++) { const d = days[S.addDays(start, k)]; if (d) { active += d.active; audio += d.audio; } }
    return { start, active: mins(active), audio: mins(audio) };
  });
  D.weeks = weeks;
  const W = 360, H = 190, pl = 36, pr = 4, pt = 8, pb = 22, iw = W - pl - pr, ih = H - pt - pb;
  const max = niceMax(Math.max(10, ...weeks.map((w) => w.active + w.audio)));
  const bw = iw / weeks.length, barW = Math.min(28, bw * 0.6);
  const y = (v) => pt + ih - (v / max) * ih;
  let g = "";
  for (const v of [0, max / 2, max]) {
    g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(${v === 0 ? "--axis" : "--grid"})" stroke-width="1"/>
          <text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}분</text>`;
  }
  weeks.forEach((w, i) => {
    const x = pl + i * bw + (bw - barW) / 2;
    const hA = (w.active / max) * ih, hB = (w.audio / max) * ih;
    const yA = pt + ih - hA;
    if (hA > 0) g += hB > 0
      ? `<rect x="${x}" y="${yA}" width="${barW}" height="${hA}" fill="var(--series-1)"/>`
      : `<path d="${topRounded(x, yA, barW, hA)}" fill="var(--series-1)"/>`;
    if (hB > 0) { const yB = yA - (hA > 0 ? 2 : 0) - hB; g += `<path d="${topRounded(x, yB, barW, hB)}" fill="var(--series-2)"/>`; }
    g += `<text x="${x + barW / 2}" y="${H - 6}" text-anchor="middle">${md(w.start)}</text>
          <rect class="hit" data-w="${i}" x="${pl + i * bw}" y="${pt}" width="${bw}" height="${ih + pb}"/>`;
  });
  return `<div class="legend"><span><i style="background:var(--series-1)"></i>학습·복습</span><span><i style="background:var(--series-2)"></i>듣기</span></div>
    <svg class="chart" id="wk" viewBox="0 0 ${W} ${H}" role="img" aria-label="주간 학습 시간 막대그래프">${g}</svg>
    <div class="readout" id="wkr">이번 주: 학습 ${weeks[7].active}분 · 듣기 ${weeks[7].audio}분</div>
    <details class="tableview"><summary>표로 보기</summary><table class="t"><tr><th>주 시작</th><th>학습</th><th>듣기</th></tr>
      ${weeks.map((w) => `<tr><td>${md(w.start)}</td><td>${w.active}분</td><td>${w.audio}분</td></tr>`).join("")}</table></details>`;
}

function calendar(days, today) {
  const end = weekStart(today), weeks = 12, start = S.addDays(end, -7 * (weeks - 1));
  let cells = "";
  for (let r = 0; r < 7; r++) {
    cells += `<div class="dl">${"월화수목금토일"[r]}</div>`;
    for (let c = 0; c < weeks; c++) {
      const d = S.addDays(start, c * 7 + r);
      const v = days[d];
      const m = v ? mins(v.active + v.audio) : 0;
      const lv = m === 0 ? "" : m < 10 ? "l1" : m < 20 ? "l2" : m < 40 ? "l3" : "l4";
      cells += `<button class="${lv} ${d > today ? "future" : ""} ${d === today ? "today" : ""}" data-d="${d}" aria-label="${d} ${m}분"></button>`;
    }
  }
  return `<div class="cal" style="--weeks:${weeks}">${cells}</div>
    <div class="scale">적음 <i style="background:var(--seq-0)"></i><i style="background:var(--seq-2)"></i><i style="background:var(--seq-3)"></i><i style="background:var(--seq-5)"></i><i style="background:var(--seq-6)"></i> 많음 (10·20·40분 기준)</div>
    <div class="readout" id="calr">칸을 누르면 그날 기록이 보여요</div>`;
}

function boxBars(prog) {
  const counts = [1, 2, 3, 4, 5, 6, 7].map((b) => prog.filter((p) => p.box === b).length);
  const max = Math.max(1, ...counts);
  const notYet = D.words.length - prog.length;
  return counts.map((n, i) => `<div class="hbar"><span>${i === 6 ? "졸업 🎓" : "상자 " + (i + 1)}</span>
      <div class="track"><div class="fill" style="width:${(n / max) * 100}%;background:var(--seq-${i === 6 ? 6 : i})"></div></div>
      <span class="v">${n}개</span></div>`).join("") +
    `<p class="muted" style="font-size:13px;margin-top:8px">복습 간격: 상자1 다음날 → 2: 3일 → 3: 7일 → 4: 14일 → 5: 30일 → 6: 60일 → 졸업 · 아직 안 배운 단어 ${notYet}개</p>`;
}

function weakTable(prog) {
  const rows = prog.filter((p) => p.wrong_count > 0)
    .map((p) => ({ p, w: D.byId[p.word_id], rate: p.wrong_count / (p.wrong_count + p.correct_count) }))
    .filter((x) => x.w).sort((a, b) => b.rate - a.rate || b.p.wrong_count - a.p.wrong_count).slice(0, 10);
  if (!rows.length) return `<p class="muted">아직 틀린 단어가 없어요 👍</p>`;
  return `<table class="t"><tr><th>단어</th><th>뜻</th><th style="text-align:right">오답</th><th style="text-align:right">상자</th></tr>
    ${rows.map(({ p, w }) => `<tr><td class="en">${w.emoji} ${esc(S.spoken(w))}</td><td>${esc(w.meaning)}</td>
      <td class="num">${p.wrong_count}/${p.wrong_count + p.correct_count}</td><td class="num">${p.box === 7 ? "졸업" : p.box}</td></tr>`).join("")}</table>`;
}

function speakChart(thisWeek) {
  const sp = D.answers.filter((a) => (a.mode === "speak" || a.mode === "chunk_speak") && a.speak_score != null);
  if (!sp.length) return `<p class="muted">아직 발음 점수 기록이 없어요. 아이폰 설정에서 받아쓰기(키보드 › 받아쓰기 활성화)가 켜져 있어야 점수가 기록돼요.</p>`;
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = S.addDays(thisWeek, -7 * (7 - i));
    const list = sp.filter((a) => { const d = S.kstDate(a.answered_at); return d >= start && d < S.addDays(start, 7); });
    return { start, n: list.length, avg: list.length ? list.reduce((s, a) => s + a.speak_score, 0) / list.length : null };
  });
  D.speakWeeks = weeks;
  const W = 360, H = 160, pl = 36, pr = 4, pt = 8, pb = 22, iw = W - pl - pr, ih = H - pt - pb;
  const bw = iw / 8, barW = Math.min(28, bw * 0.6), y = (v) => pt + ih - (v / 3) * ih;
  let g = "";
  for (const v of [0, 1, 2, 3]) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(${v === 0 ? "--axis" : "--grid"})"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">⭐${v}</text>`;
  weeks.forEach((w, i) => {
    const x = pl + i * bw + (bw - barW) / 2;
    if (w.avg != null) g += `<path d="${topRounded(x, y(w.avg), barW, (w.avg / 3) * ih)}" fill="var(--series-1)"/>`;
    g += `<text x="${x + barW / 2}" y="${H - 6}" text-anchor="middle">${md(w.start)}</text><rect class="hit" data-s="${i}" x="${pl + i * bw}" y="${pt}" width="${bw}" height="${ih + pb}"/>`;
  });
  const last = [...weeks].reverse().find((w) => w.avg != null);
  return `<svg class="chart" id="spk" viewBox="0 0 ${W} ${H}" role="img" aria-label="주별 발음 점수">${g}</svg>
    <div class="readout" id="spkr">${last ? `${md(last.start)} 주: 평균 ⭐${last.avg.toFixed(1)} (${last.n}회)` : ""}</div>`;
}

// ═════════════════════════ 표 ═════════════════════════
function sessionTable() {
  const acc = {};
  for (const a of D.answers) if (QUIZ.has(a.mode)) { const x = (acc[a.session_id] ||= [0, 0]); x[1]++; if (a.is_correct) x[0]++; }
  const rows = [...D.sessions].sort((a, b) => (a.started_at < b.started_at ? 1 : -1)).slice(0, 15);
  if (!rows.length) return `<p class="muted">아직 기록이 없어요</p>`;
  return `<table class="t"><tr><th>언제</th><th>종류</th><th>내용</th><th style="text-align:right">정답률</th><th style="text-align:right">시간</th></tr>
    ${rows.map((s) => {
      const t = kst(s.started_at), d = s.started_at && S.kstDate(s.started_at);
      const what = s.kind === "audio" ? `${s.audio_words}단어` : [s.new_words ? `새 ${s.new_words}` : "", s.reviewed_words ? `복습 ${s.reviewed_words}` : ""].filter(Boolean).join(" · ") || "–";
      const a = acc[s.id];
      const sec = s.kind === "audio" ? s.audio_seconds : (new Date(s.ended_at || s.started_at) - new Date(s.started_at)) / 1000;
      return `<tr><td>${md(d)}(${dow(d)}) ${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}</td>
        <td>${KIND[s.kind] || s.kind}</td><td>${what}</td><td class="num">${a ? pct(a[0], a[1]) + "%" : "–"}</td><td class="num">${fmtMin(sec)}</td></tr>`;
    }).join("")}</table>`;
}

function wrongTable() {
  const rows = D.answers.filter((a) => !a.is_correct && QUIZ.has(a.mode)).slice(0, 15);
  if (!rows.length) return `<p class="muted">최근에 틀린 문제가 없어요 👍</p>`;
  return `<table class="t"><tr><th>언제</th><th>단어</th><th>문제</th><th>들린 말</th></tr>
    ${rows.map((a) => { const w = D.byId[a.word_id], d = S.kstDate(a.answered_at);
      return `<tr><td>${md(d)}(${dow(d)})</td><td class="en">${w ? w.emoji + " " + esc(S.spoken(w)) : esc(a.word_id)}</td>
        <td><span class="tag no">${a.phase === "test" ? "테스트 · " : a.phase === "review" ? "복습 · " : ""}${MODE[a.mode] || a.mode}</span></td><td class="muted">${esc(a.transcript || "")}</td></tr>`; }).join("")}</table>`;
}

// ═════════════════════════ Day 진도 ═════════════════════════
const DSTATUS = { learning: ["학습 중", ""], testing: ["테스트 대기", ""], passed: ["통과", "ok"] };
function todayBanner(today, lastDay) {
  const recs = Object.values(D.days);
  const passedToday = recs.find((r) => r.passed_at && S.kstDate(r.passed_at) === today);
  let cur = null;
  for (let d = 1; d <= lastDay; d++) if (D.days[d]?.status !== "passed") { cur = d; break; }
  const theme = (d) => D.sched[d - 1]?.theme || "";
  let icon, title, sub;
  if (passedToday) {
    const r = passedToday, perfect = r.first_correct === r.first_total;
    icon = perfect ? "💯" : "✅";
    title = `오늘 Day ${r.day} (${theme(r.day)}) 통과`;
    sub = `첫 도전 ${r.first_correct}/${r.first_total} 정답${r.test_rounds > 1 ? ` · ${r.test_rounds}번 만에 통과` : " · 한 번에 통과"} · ${kstTime(r.passed_at)}`;
  } else if (cur) {
    const r = D.days[cur];
    icon = r?.status === "testing" ? "📝" : r?.started_at ? "✏️" : "⏳";
    title = `오늘 할 차례: Day ${cur} (${theme(cur)})`;
    sub = !r?.started_at ? "아직 시작하지 않았어요" : r.status === "testing"
      ? `반복 학습 완료 · 테스트 ${r.test_rounds ? `${r.test_rounds}번 도전, 아직 통과 전` : "대기 중"}` : "반복 학습 중";
  } else { icon = "👑"; title = "모든 Day 통과!"; sub = `${lastDay}일 단어장을 완주했어요`; }
  return `<div class="card" style="display:flex;gap:14px;align-items:center;margin-top:14px">
    <span style="font-size:40px">${icon}</span><div><div style="font-size:18px">${esc(title)}</div><div class="muted" style="font-size:14px">${esc(sub)}</div></div></div>`;
}
function kstTime(iso) { const t = kst(iso); return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`; }
function dayTable(lastDay) {
  const theme = (d) => D.sched[d - 1]?.theme || "";
  const cells = Array.from({ length: lastDay }, (_, i) => {
    const r = D.days[i + 1];
    const bg = r?.status === "passed" ? (r.first_correct === r.first_total ? "var(--yellow)" : "var(--mint)") : r ? "var(--seq-2)" : "var(--seq-0)";
    const rv = D.sched[i]?.kind === "review";
    return `<span title="Day ${i + 1}${rv ? " 복습" : ""}" style="min-width:0;aspect-ratio:1;border-radius:${rv ? "50%" : "6px"};background:${bg};display:grid;place-items:center;font-size:11px;color:${r?.status === "passed" ? "#fff" : "var(--muted)"};${rv && r?.status !== "passed" ? "outline:2px solid #F2C45A;outline-offset:-2px" : ""}">${rv ? "🌟" : i + 1}</span>`;
  }).join("");
  const rows = Object.values(D.days).filter((r) => r.started_at).sort((a, b) => b.day - a.day).slice(0, 14);
  return `<div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;max-width:360px">${cells}</div>
    <div class="legend" style="margin:10px 0 4px"><span><i style="background:var(--yellow)"></i>한 번에 통과</span><span><i style="background:var(--mint)"></i>재도전 후 통과</span><span><i style="background:var(--seq-2)"></i>진행 중</span><span>🌟 복습 Day</span></div>
    ${rows.length ? `<table class="t"><tr><th>Day</th><th>주제</th><th>상태</th><th style="text-align:right">첫 테스트</th><th style="text-align:right">도전</th></tr>
    ${rows.map((r) => `<tr><td>${r.day}</td><td>${esc(theme(r.day))}</td>
      <td><span class="tag ${DSTATUS[r.status]?.[1] || ""}">${DSTATUS[r.status]?.[0] || r.status}</span>${r.passed_at ? ` <span class="muted" style="font-size:12px">${md(S.kstDate(r.passed_at))}</span>` : ""}</td>
      <td class="num">${r.first_total ? `${r.first_correct}/${r.first_total}` : "–"}</td><td class="num">${r.test_rounds || 0}번</td></tr>`).join("")}</table>`
      : `<p class="muted">아직 시작한 Day가 없어요</p>`}`;
}

// ═════════════════════════ 보상 · 설정 ═════════════════════════
const COND = { streak: ["연속 학습", "일"], graduated: ["졸업 단어", "개"], xp: ["누적 점수", "점"], days: ["통과한 Day", "개"] };
function rewardsBlock(streak, grad) {
  const xp = D.sessions.reduce((a, s) => a + (s.xp || 0), 0);
  const val = { streak, graduated: grad, xp, days: Object.values(D.days).filter((r) => r.status === "passed").length };
  // 달성한 보상은 자동으로 달성일 기록
  for (const r of D.rewards) if (!r.achieved_at && val[r.condition_type] >= r.target) { r.achieved_at = S.nowISO(); DB.saveReward({ ...r }); }
  const list = D.rewards.map((r) => {
    const [label, unit] = COND[r.condition_type];
    return `<div class="rw"><span>${r.achieved_at ? "🎁" : "🎯"}</span><div class="grow"><div>${esc(r.title)}</div>
      <div class="muted" style="font-size:13px">${label} ${r.target}${unit} · 현재 ${Math.min(val[r.condition_type], r.target)}${unit}
      ${r.achieved_at ? ` · <span class="tag ok">${md(S.kstDate(r.achieved_at))} 달성</span>` : ""}</div></div>
      <button data-del="${r.id}" aria-label="삭제">🗑</button></div>`;
  }).join("");
  return `${list || `<p class="muted">아직 보상이 없어요. 아래에서 추가해 보세요.</p>`}
    <div class="form"><input class="input" id="rt" placeholder="보상 (예: 주말에 야구장 가기)">
      <div class="row"><select class="input" id="rc"><option value="streak">연속 학습일</option><option value="graduated">졸업 단어 수</option><option value="xp">누적 점수</option><option value="days">통과한 Day 수</option></select>
      <input class="input" id="rn" type="number" inputmode="numeric" min="1" placeholder="목표 (예: 30)"></div>
      <button class="btn small" id="radd">보상 추가</button></div>`;
}

function settingsBlock() {
  const L = DB.learner;
  const seg = (name, opts, cur) => `<div class="seg" data-set="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${v == cur ? "on" : ""}">${l}</button>`).join("")}</div>`;
  return `<div class="field"><label>하루 학습량</label><p style="font-size:15px">학습 Day 하루 7개 → 5일마다 복습 Day (Day 1~36, 4학년 단어·숙어 210개). 학습 Day는 어제 단어 복습으로 시작</p></div>
    <div class="field"><label>학년</label>${seg("grade", [[3, "3학년"], [4, "4학년"], [5, "5학년"], [6, "6학년"]], L.grade)}</div>
    <div class="field"><label>부모 화면 비밀번호 (숫자 4자리 · 아이가 설정을 바꾸지 않도록)</label>
      <div class="row"><input class="input" id="pinset" type="password" inputmode="numeric" maxlength="4" placeholder="${L.parent_pin ? "설정됨 — 바꾸려면 입력" : "설정 안 됨"}">
      <button class="btn small ghost" id="pinsave" style="flex:0 0 96px">저장</button></div></div>
    ${DB.mode === "cloud" ? `<button class="btn small ghost" id="logout">로그아웃</button>`
      : `<p class="note">체험 모드예요. js/config.js 에 Supabase 주소와 키를 넣으면 기록이 서버에 저장되고, 부모님 폰에서도 볼 수 있어요.</p>`}`;
}

// ═════════════════════════ 이벤트 ═════════════════════════
function bind() {
  document.getElementById("refresh").onclick = load;

  const wk = document.getElementById("wk");
  wk?.addEventListener("click", (e) => {
    const h = e.target.closest("[data-w]"); if (!h) return;
    const w = D.weeks[+h.dataset.w];
    document.getElementById("wkr").textContent = `${md(w.start)} 주: 학습 ${w.active}분 · 듣기 ${w.audio}분 · 합계 ${w.active + w.audio}분`;
  });
  document.getElementById("spk")?.addEventListener("click", (e) => {
    const h = e.target.closest("[data-s]"); if (!h) return;
    const w = D.speakWeeks[+h.dataset.s];
    document.getElementById("spkr").textContent = w.avg == null ? `${md(w.start)} 주: 기록 없음` : `${md(w.start)} 주: 평균 ⭐${w.avg.toFixed(1)} (${w.n}회)`;
  });
  const days = aggregate();
  document.querySelector(".cal")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-d]"); if (!b) return;
    document.querySelectorAll(".cal .sel").forEach((x) => x.classList.remove("sel"));
    b.classList.add("sel");
    const d = b.dataset.d, v = days[d];
    document.getElementById("calr").textContent = v
      ? `${md(d)}(${dow(d)}) · 학습 ${mins(v.active)}분 · 듣기 ${mins(v.audio)}분 · 새 단어 ${v.newW} · 복습 ${v.revW}`
      : `${md(d)}(${dow(d)}) · 기록 없음`;
  });

  document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!(await ask("이 보상을 삭제할까요?", "삭제"))) return;
    DB.deleteReward(b.dataset.del); D.rewards = D.rewards.filter((r) => r.id !== b.dataset.del); render();
  }));
  document.getElementById("radd").onclick = () => {
    const title = document.getElementById("rt").value.trim(), target = +document.getElementById("rn").value;
    if (!title || !(target > 0)) return notice("보상 내용과 목표 숫자를 입력해 주세요");
    const r = { id: S.uuid(), learner_id: DB.learner.id, title, condition_type: document.getElementById("rc").value, target, achieved_at: null, created_at: S.nowISO() };
    D.rewards.push(r); DB.saveReward(r); render();
  };
  document.querySelectorAll("[data-set]").forEach((g) => g.querySelectorAll("button").forEach((b) => (b.onclick = async () => {
    await DB.updateLearner({ [g.dataset.set]: +b.dataset.v }); render();
  })));
  document.getElementById("pinsave").onclick = async () => {
    const v = document.getElementById("pinset").value;
    if (v && !/^\d{4}$/.test(v)) return notice("숫자 4자리로 입력해 주세요");
    await DB.updateLearner({ parent_pin: v || null });
    if (v) ss.set("je.pin", v);
    render(); notice(v ? "비밀번호를 저장했어요" : "비밀번호를 지웠어요");
  };
  document.getElementById("logout")?.addEventListener("click", async () => {
    if (!(await ask("로그아웃할까요? 이 폰에서 다시 로그인해야 해요.", "로그아웃"))) return;
    await DB.signOut(); location.reload();
  });
}

boot();
