// 🎵 억양(음높이)·강세(소리 세기) 그래프
// - 원어민 음성 MP3를 분석해 회색 점선(음높이)과 하늘색 막대(세기)로 보여 주고
// - 지후가 말하는 동안 마이크 소리를 실시간 분석해 주황색 선·막대로 겹쳐 그림
// - 목소리 높이가 달라도 "오르내림 모양"을 비교하도록 각자 평균 높이 기준(반음 단위)으로 맞춤

import { audioCtx } from "./audio.js";
const ctx = audioCtx;

// ── 음높이 찾기 (정규화 자기상관, 70~500Hz) ──
function detect(buf, sr) {
  // 2배 솎아내기로 계산량 절반
  const n = buf.length >> 1, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (buf[2 * i] + buf[2 * i + 1]) * 0.5;
  const fs = sr / 2;
  let e = 0;
  for (let i = 0; i < n; i++) e += x[i] * x[i];
  const rms = Math.sqrt(e / n);
  if (rms < 0.008) return { f0: 0, rms };
  const minLag = Math.floor(fs / 500), maxLag = Math.min(n - 2, Math.floor(fs / 70));
  const nsdf = new Float32Array(maxLag + 2);
  let max = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let ac = 0, m = 0;
    for (let i = 0; i < n - lag; i++) { const a = x[i], b = x[i + lag]; ac += a * b; m += a * a + b * b; }
    const v = m ? (2 * ac) / m : 0;
    nsdf[lag] = v;
    if (v > max) max = v;
  }
  if (max < 0.55) return { f0: 0, rms };
  // 옥타브 오류 방지: 최댓값의 90% 이상인 첫 봉우리
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const v = nsdf[lag];
    if (v >= 0.9 * max && v >= nsdf[lag - 1] && v >= nsdf[lag + 1]) {
      const a = nsdf[lag - 1], b = v, c = nsdf[lag + 1];
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1); // 포물선 보간
      return { f0: fs / (lag + (Number.isFinite(shift) ? shift : 0)), rms };
    }
  }
  return { f0: 0, rms };
}

// 음성 전체 분석 → { t:[초], f0:[Hz|0], rms:[] }
function analyze(samples, sr, hop = 0.012) {
  const win = 2048, step = Math.max(1, Math.round(sr * hop));
  const out = { t: [], f0: [], rms: [] };
  for (let s = 0; s + win <= samples.length; s += step) {
    const r = detect(samples.subarray(s, s + win), sr);
    out.t.push(s / sr); out.f0.push(r.f0); out.rms.push(r.rms);
  }
  return out;
}

// ── 원어민 기준선 (MP3 분석, 주소별 캐시) ──
const refCache = new Map();
export function refContour(url) {
  if (!url) return Promise.resolve(null);
  if (!refCache.has(url)) {
    refCache.set(url, (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("no audio");
      const ab = await res.arrayBuffer();
      const audio = await new Promise((ok, no) => ctx().decodeAudioData(ab, ok, no));
      return analyze(audio.getChannelData(0), audio.sampleRate);
    })().catch(() => null));
  }
  return refCache.get(url);
}

// ── 실시간 마이크 분석 ──
export class LiveCapture {
  constructor(onFrame) { this.onFrame = onFrame; this.data = { t: [], f0: [], rms: [] }; }
  async start() {
    const c = ctx();
    if (c.state === "suspended") await c.resume();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.src = c.createMediaStreamSource(this.stream);
    this.an = c.createAnalyser();
    this.an.fftSize = 2048;
    this.src.connect(this.an);
    this.buf = new Float32Array(this.an.fftSize);
    this.t0 = performance.now();
    this.alive = true;
    let last = 0;
    const tick = (now) => {
      if (!this.alive) return;
      if (now - last > 30) { // 약 30fps
        last = now;
        this.an.getFloatTimeDomainData(this.buf);
        const r = detect(this.buf, c.sampleRate);
        this.data.t.push((now - this.t0) / 1000); this.data.f0.push(r.f0); this.data.rms.push(r.rms);
        this.onFrame?.(this.data);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return this;
  }
  stop() {
    this.alive = false;
    try { this.src?.disconnect(); } catch {}
    this.stream?.getTracks().forEach((t) => t.stop()); // 마이크 바로 끄기 (아이폰 소리 작아짐 방지)
    return this.data;
  }
}

// ── 비교용 정리: 소리 나는 구간만 잘라 N칸으로 맞춤 ──
function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; }
export function shape(d, N = 64) {
  if (!d || !d.rms.length) return null;
  const maxE = Math.max(...d.rms);
  if (maxE < 0.01) return null;
  let a = d.rms.findIndex((v) => v > maxE * 0.12), b = d.rms.length - 1;
  while (b > a && d.rms[b] <= maxE * 0.12) b--;
  if (a < 0 || b - a < 3) return null;
  const f0 = d.f0.slice(a, b + 1), rms = d.rms.slice(a, b + 1);
  const med = median(f0.filter((v) => v > 0)) || 1;
  const pitch = [], energy = [];
  for (let k = 0; k < N; k++) {
    const i = Math.min(f0.length - 1, Math.round((k / (N - 1)) * (f0.length - 1)));
    pitch.push(f0[i] > 0 ? Math.max(-9, Math.min(9, 12 * Math.log2(f0[i] / med))) : null); // 반음
    energy.push(rms[i] / maxE);
  }
  return { pitch, energy, dur: d.t[b] - d.t[a] };
}

// 억양(음높이 모양 상관) · 강세(세기 모양 일치) 점수 0~100
export function compare(ref, kid) {
  if (!ref || !kid) return null;
  const xs = [], ys = [];
  ref.pitch.forEach((v, i) => { if (v != null && kid.pitch[i] != null) { xs.push(v); ys.push(kid.pitch[i]); } });
  let tone = null;
  if (xs.length >= 6) {
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    let sxy = 0, sxx = 0, syy = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
    const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
    const flat = Math.sqrt(sxx / xs.length) < 0.8 && Math.sqrt(syy / ys.length) < 1.2; // 둘 다 평평하면 비슷한 것
    tone = Math.round(Math.max(0, flat ? 0.85 : r) * 100);
  }
  const diff = ref.energy.reduce((a, v, i) => a + Math.abs(v - kid.energy[i]), 0) / ref.energy.length;
  const stress = Math.round(Math.max(0, 1 - diff * 1.6) * 100);
  return { tone, stress };
}

// ── 그리기 ──
const C = { ref: "#9A93B8", refFill: "rgba(59,167,255,.28)", kid: "#FF7A3D", kidFill: "rgba(255,122,61,.38)", grid: "#EFE4D4" };
export function draw(canvas, { ref, kid, live, liveData, liveMax = 3 }) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const top = 8, pH = H * 0.62, eTop = top + pH + 6, eH = H - eTop - 4;
  const y = (st) => top + pH / 2 - (st / 9) * (pH / 2);
  g.strokeStyle = C.grid; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, y(0)); g.lineTo(W, y(0)); g.moveTo(0, eTop + eH); g.lineTo(W, eTop + eH); g.stroke();

  const bars = (energy, fill, x0, w, offset = 0, width = 0.42) => {
    g.fillStyle = fill;
    const n = energy.length, bw = (w / n) * width;
    energy.forEach((v, i) => { const h = Math.max(1, v * eH); g.fillRect(x0 + (i / n) * w + offset * (w / n), eTop + eH - h, bw, h); });
  };
  const line = (pitch, color, x0, w, dash) => {
    g.strokeStyle = color; g.lineWidth = dash ? 3 : 4; g.lineCap = "round"; g.lineJoin = "round";
    g.setLineDash(dash ? [6, 6] : []);
    g.beginPath();
    let pen = false;
    pitch.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      const X = x0 + (i / (pitch.length - 1)) * w, Y = y(v);
      pen ? g.lineTo(X, Y) : g.moveTo(X, Y); pen = true;
    });
    g.stroke(); g.setLineDash([]);
  };

  if (live && liveData) {
    // 실시간: 원어민 모양은 앞부분에 고정, 지후 소리는 시간대로 오른쪽으로 그려짐
    if (ref) { const w = Math.min(W, (ref.dur / liveMax) * W); bars(ref.energy, C.refFill, 0, w); line(ref.pitch, C.ref, 0, w, true); }
    const d = liveData, n = d.t.length;
    if (n > 1) {
      const med = median(d.f0.filter((v) => v > 0)) || 200;
      const maxE = Math.max(0.05, ...d.rms);
      g.fillStyle = C.kidFill;
      for (let i = 0; i < n; i++) {
        const X = (d.t[i] / liveMax) * W; if (X > W) break;
        const h = (d.rms[i] / maxE) * eH; g.fillRect(X, eTop + eH - h, 3, h);
      }
      g.strokeStyle = C.kid; g.lineWidth = 4; g.lineCap = "round"; g.beginPath();
      let pen = false;
      for (let i = 0; i < n; i++) {
        const X = (d.t[i] / liveMax) * W; if (X > W) break;
        if (!d.f0[i]) { pen = false; continue; }
        const Y = y(Math.max(-9, Math.min(9, 12 * Math.log2(d.f0[i] / med))));
        pen ? g.lineTo(X, Y) : g.moveTo(X, Y); pen = true;
      }
      g.stroke();
    }
    return;
  }
  // 결과: 둘 다 소리 나는 구간을 같은 폭으로 맞춰 겹쳐 그림
  if (ref) { bars(ref.energy, C.refFill, 0, W, 0); line(ref.pitch, C.ref, 0, W, true); }
  if (kid) { bars(kid.energy, C.kidFill, 0, W, 0.45); line(kid.pitch, C.kid, 0, W, false); }
}
export const _test = { detect, analyze };
