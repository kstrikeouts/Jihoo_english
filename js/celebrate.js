// 🎉 테스트 통과 칭찬 씬 — 폭죽, 마스코트, 별, 도장, 점수, 효과음·음성 칭찬
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const calm = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

const HEAD_PERFECT = ["한 번에 100점!", "완벽해! 하나도 안 틀렸어!", "만점이야! 진짜 대단해!"];
const HEAD_PASS = ["끝까지 해냈어! 최고야!", "포기하지 않았구나, 멋져!", "통과! 정말 잘했어!"];
const SUB_PERFECT = ["영어 천재가 나타났다! 👑", "오늘의 주인공은 바로 너야!", "선생님도 깜짝 놀라겠는걸?"];
const SUB_PASS = ["틀려도 다시 도전한 게 진짜 멋진 거야!", "한 번 더 해서 결국 해냈어!", "어려웠는데 끝까지 했구나!"];
const VOICE_PERFECT = ["Perfect! You are amazing!", "Wow! A perfect score! Great job!", "Excellent! You are a superstar!"];
const VOICE_PASS = ["You did it! Great job!", "Well done! You never gave up!", "Awesome! You passed!"];
const TAP = ["Super!", "Awesome!", "Fantastic!", "You rock!", "Hooray!", "Great job!"];

export function celebrate(o) {
  document.querySelector(".feedback")?.remove();
  const ratio = o.total ? o.firstCorrect / o.total : 1;
  const head = o.review ? pick(o.perfect ? ["복습 테스트 만점!", "5일치 단어 완벽 마스터!"] : ["5일치 단어 마스터!", "복습까지 끝! 최고야!"])
    : pick(o.perfect ? HEAD_PERFECT : HEAD_PASS);
  const sub = o.review ? `지난 5일 동안 배운 단어 ${o.wordCount}개를 다 기억했어! 🌟` : pick(o.perfect ? SUB_PERFECT : SUB_PASS);
  const stars = o.perfect ? 3 : ratio >= 0.7 ? 2 : 1;
  const el = document.createElement("div");
  el.className = "party" + (o.perfect ? " perfect" : "");
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", `Day ${o.day} 통과`);
  el.innerHTML = `
    <canvas class="confetti" aria-hidden="true"></canvas>
    <div class="party-in">
      <button class="mascot" id="mascot" aria-label="한 번 더 축하하기">
        <span class="face">🦊</span>${o.perfect ? `<span class="crown">👑</span>` : ""}
        <span class="spark s1">✨</span><span class="spark s2">⭐</span><span class="spark s3">✨</span>
      </button>
      <p class="party-name">${esc(o.name)}!</p>
      <h1 class="party-head">${esc(head)}</h1>
      <p class="party-sub">${esc(sub)}</p>
      <div class="party-stars" aria-label="별 ${stars}개">${[1, 2, 3].map((i) =>
        `<span class="pstar ${i <= stars ? "on" : ""}" style="--d:${0.35 + i * 0.28}s">★</span>`).join("")}</div>
      <div class="party-row">
        <div class="stamp ${o.review ? "rv" : ""}" style="--d:1.45s"><small>DAY</small><b>${o.day}</b><span>${o.review ? "복습 통과" : "통과"}</span></div>
        <div class="party-facts">
          <div><span>오늘 주제</span><b>${esc(o.theme)}</b></div>
          <div><span>첫 도전</span><b>${o.firstCorrect}/${o.total} 정답</b></div>
          <div><span>받은 점수</span><b>⭐ +<i id="xpn">0</i></b></div>
        </div>
      </div>
      <div class="party-words">${o.words.map((w, i) => `<span style="--d:${1.8 + i * 0.08}s" title="${esc(w.word)}">${w.emoji}</span>`).join("")}</div>
      <div class="stack party-btns">
        <button class="btn" id="phome">홈으로</button>
        <button class="btn ghost" id="plis">🎧 오늘 단어 듣기</button>
      </div>
      <div class="party-board"><p class="party-board-t">나의 도장판</p>${o.stamps}</div>
    </div>`;
  document.body.appendChild(el);

  // 효과음 → 음성 칭찬
  o.fx?.("fanfare");
  const t1 = setTimeout(() => o.say?.(pick(o.perfect ? VOICE_PERFECT : VOICE_PASS)), 1100);

  // 점수 카운트업
  const xpn = el.querySelector("#xpn");
  const t0 = performance.now(), dur = calm() ? 1 : 1200;
  const tick = (t) => {
    const k = Math.min(1, (t - t0 - 900) / dur);
    if (k > 0) xpn.textContent = Math.round(o.xp * (1 - Math.pow(1 - k, 3)));
    if (k < 1 && document.body.contains(el)) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // 폭죽
  const conf = confetti(el.querySelector(".confetti"), o.perfect);
  conf.burst(o.perfect ? 220 : 150);
  const t2 = setTimeout(() => conf.burst(o.perfect ? 120 : 70), 1500);

  el.querySelector("#mascot").onclick = () => {
    conf.burst(90);
    o.fx?.("ok");
    o.say?.(pick(TAP));
    const m = el.querySelector("#mascot");
    m.classList.remove("jump"); void m.offsetWidth; m.classList.add("jump");
  };
  const close = (fn) => { clearTimeout(t1); clearTimeout(t2); conf.stop(); el.remove(); fn?.(); };
  el.querySelector("#phome").onclick = () => close(o.onHome);
  el.querySelector("#plis").onclick = () => close(o.onListen);
}

// 캔버스 폭죽 (반짝이 종이 + 별)
function confetti(canvas, gold) {
  const ctx = canvas.getContext("2d");
  const colors = gold
    ? ["#FFC53D", "#FF7A3D", "#FFE08A", "#FF5B5B", "#8B7CF6", "#1FBF8A", "#3BA7FF"]
    : ["#FF7A3D", "#3BA7FF", "#1FBF8A", "#FFC53D", "#FF8A8A", "#8B7CF6"];
  let parts = [], raf = 0, W = 0, H = 0;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = () => {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  addEventListener("resize", size);
  const still = calm();

  function burst(n) {
    for (let i = 0; i < n; i++) {
      const fromSide = i % 3; // 0: 가운데 위로 펑, 1: 왼쪽 아래, 2: 오른쪽 아래
      const x = fromSide === 0 ? W / 2 : fromSide === 1 ? -10 : W + 10;
      const y = fromSide === 0 ? H * 0.32 : H * 0.85;
      const ang = fromSide === 0 ? Math.random() * Math.PI * 2 : fromSide === 1 ? -Math.PI / 2 + 0.25 + Math.random() * 0.6 : -Math.PI / 2 - 0.25 - Math.random() * 0.6;
      const sp = fromSide === 0 ? 4 + Math.random() * 7 : 9 + Math.random() * 8;
      parts.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (fromSide === 0 ? 2 : 0),
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35,
        c: colors[i % colors.length], star: Math.random() < 0.18, life: 0,
      });
    }
    if (still) { drawStill(); return; }
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function drawPart(p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
    if (p.star) {
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const rad = k % 2 ? 4 : 9, a = (k * Math.PI) / 5 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath(); ctx.fill();
    } else {
      ctx.scale(1, Math.cos(p.life * 0.25)); // 팔랑팔랑
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    ctx.restore();
  }
  function loop() {
    ctx.clearRect(0, 0, W, H);
    parts = parts.filter((p) => p.y < H + 30 && p.life < 420);
    for (const p of parts) {
      p.life++; p.vy += 0.18; p.vx *= 0.985; p.vy *= 0.985;
      p.vx += Math.sin(p.life * 0.05 + p.w) * 0.04;
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      drawPart(p);
    }
    raf = parts.length ? requestAnimationFrame(loop) : 0;
    if (!parts.length) ctx.clearRect(0, 0, W, H);
  }
  function drawStill() {
    ctx.clearRect(0, 0, W, H);
    parts.forEach((p) => { p.x = Math.random() * W; p.y = Math.random() * H * 0.5; drawPart(p); });
    parts = [];
  }
  return {
    burst,
    stop() { cancelAnimationFrame(raf); raf = 0; parts = []; removeEventListener("resize", size); },
  };
}
