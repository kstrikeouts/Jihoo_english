// 오프라인 지원 — 지하철에서도 앱과 음성이 동작하도록
// 앱 파일을 고치면 VERSION 숫자를 올려 주세요 (새 버전이 폰에 반영됨)
const VERSION = "je-v4";
const SHELL = `${VERSION}-shell`;
const AUDIO = "je-audio";       // 음성 파일은 버전과 무관하게 유지
const RUNTIME = "je-runtime";   // 글꼴·라이브러리
const SHELL_FILES = [
  "./", "index.html", "parent.html", "css/style.css", "manifest.json",
  "js/app.js", "js/parent.js", "js/config.js", "js/db.js", "js/srs.js", "js/audio.js", "js/speech.js", "js/ui.js", "js/celebrate.js",
  "data/words_g4.json", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.endsWith("-shell") && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return;                 // 데이터 API 는 캐시하지 않음
  if (url.origin === location.origin && url.pathname.includes("/audio/") && url.pathname.endsWith(".mp3")) {
    e.respondWith(audioResponse(req)); return;
  }
  if (url.origin === location.origin) { e.respondWith(networkFirst(req)); return; }
  if (/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.hostname)) e.respondWith(cacheFirst(req, RUNTIME));
});

// 앱 파일: 온라인이면 최신, 끊기면 저장본 (3초 넘게 응답 없으면 저장본)
async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || new Response("오프라인이에요", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

// 음성: 한 번 들은 파일은 저장. 아이폰 사파리는 오디오를 Range 요청으로 가져오므로 206 응답을 직접 만들어 줌
async function audioResponse(req) {
  const cache = await caches.open(AUDIO);
  const key = req.url.split("?")[0];
  let res = await cache.match(key);
  if (!res) {
    try {
      const net = await fetch(key);
      if (!net.ok) return net;
      await cache.put(key, net.clone());
      res = net;
    } catch { return new Response("", { status: 504 }); }
  }
  const range = req.headers.get("range");
  if (!range) return res;
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? +m[1] : 0;
  let end = m[2] ? +m[2] : buf.byteLength - 1;
  if (!m[1] && m[2]) { start = Math.max(0, buf.byteLength - +m[2]); end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${buf.byteLength}`, "Content-Length": String(end - start + 1),
    },
  });
}
