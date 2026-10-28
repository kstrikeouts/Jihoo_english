// 화면 안에서 띄우는 확인창·알림 (브라우저 기본 confirm/alert 대신 — 어디서 열어도 동작)
export function ask(msg, okLabel = "확인", cancelLabel = "취소") {
  return new Promise((resolve) => {
    document.querySelector(".sheet")?.remove();
    const el = document.createElement("div");
    el.className = "feedback sheet";
    el.innerHTML = `<div class="inner"><div class="msg" style="color:var(--ink)"></div>
      <div class="row" style="margin-top:12px"><button class="btn ghost small" data-a="0"></button>
      <button class="btn small" data-a="1"></button></div></div>`;
    el.querySelector(".msg").textContent = msg;
    el.querySelector('[data-a="0"]').textContent = cancelLabel;
    el.querySelector('[data-a="1"]').textContent = okLabel;
    el.style.background = "var(--card)";
    el.style.boxShadow = "0 -8px 30px rgba(35,33,74,.15)";
    el.onclick = (e) => {
      const b = e.target.closest("[data-a]");
      if (!b) return;
      el.remove();
      resolve(b.dataset.a === "1");
    };
    document.body.appendChild(el);
  });
}

export function notice(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
