"""
단어 JSON → 음성 MP3 자동 생성 (영어: 성인 남성 Guy, 한국어: 성인 남성 InJoon) (GitHub Actions 에서 실행)

단어마다 5개 파일:
  {id}_w.mp3   영어 단어                         (퀴즈용)
  {id}_x.mp3   영어 예문                         (퀴즈·말하기용)
  {id}_ek.mp3  영어 → (0.8초) → 뜻 → 영어         (듣기 모드: 기본)
  {id}_ke.mp3  뜻 → (2초 떠올리기) → 영어 → 영어   (듣기 모드: 떠올리기)
  {id}_ex.mp3  영어 예문 → 한국어 해석             (듣기 모드: 예문 포함)

이미 만든 단어는 건너뛰고(내용이 바뀐 단어만 다시 생성) audio/manifest.json 에 기록.
로컬 실행:  pip install edge-tts  (ffmpeg 필요)  →  python tools/build_audio.py
"""
import asyncio, hashlib, json, re, subprocess, sys, tempfile
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "audio"
MANIFEST = OUT / "manifest.json"
VOICE_EN = "en-US-GuyNeural"     # 성인 남성 · 표준 미국 발음
VOICE_KO = "ko-KR-InJoonNeural"  # 성인 남성 한국어
RATE_EN = "-10%"                 # 또박또박 조금 느리게
FORMAT_VERSION = 3               # 파일 구성이 바뀌면 숫자를 올려 전체 재생성
LEAD_MS = 500                    # 앞부분 무음 — 재생 시작 때 첫소리가 뭉개지지 않게
CONCURRENCY = 4


def spoken(w):
    """'I like ___.' 같은 빈칸 표현은 예문 첫 문장으로 읽는다 (앱과 동일 규칙)."""
    if "___" not in w["word"]:
        return w["word"]
    m = re.match(r"^[^.?!]+[.?!]", w["example"])
    return m.group(0) if m else w["example"]


def ko_text(s):
    return re.sub(r"\(.*?\)", "", s).strip()


def word_hash(w):
    key = json.dumps([FORMAT_VERSION, VOICE_EN, VOICE_KO, RATE_EN, spoken(w), w["meaning"], w["example"], w["example_ko"]], ensure_ascii=False)
    return hashlib.sha1(key.encode()).hexdigest()[:12]


async def tts(text, voice, path, rate="+0%"):
    err = None
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, voice, rate=rate).save(str(path))
            if path.stat().st_size > 0:
                return
        except Exception as e:  # 일시적 네트워크 오류 재시도
            err = e
        await asyncio.sleep(2 * (attempt + 1))
    raise RuntimeError(f"TTS 실패: {text!r} ({err or 'empty'})")


def silence(tmp, ms):
    p = tmp / f"sil_{ms}.mp3"
    if not p.exists():
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
                        "-t", str(ms / 1000), "-b:a", "48k", str(p)], check=True)
    return p


def concat(parts, out):
    """mp3 조각들을 하나로 이어 붙여 48kbps 모노 mp3 로 저장."""
    args = ["ffmpeg", "-y", "-loglevel", "error"]
    for p in parts:
        args += ["-i", str(p)]
    n = len(parts)
    filt = "".join(f"[{i}:a]aresample=24000,aformat=channel_layouts=mono[a{i}];" for i in range(n))
    filt += "".join(f"[a{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1[out]"
    args += ["-filter_complex", filt, "-map", "[out]", "-ac", "1", "-ar", "24000", "-b:a", "48k", str(out)]
    subprocess.run(args, check=True)


async def build_word(w, tmp, sem):
    async with sem:
        wid = w["id"]
        d = tmp / wid
        d.mkdir(exist_ok=True)
        en, ko, xen, xko = d / "en.mp3", d / "ko.mp3", d / "xen.mp3", d / "xko.mp3"
        await asyncio.gather(
            tts(spoken(w), VOICE_EN, en, RATE_EN),
            tts(ko_text(w["meaning"]), VOICE_KO, ko),
            tts(w["example"], VOICE_EN, xen, RATE_EN),
            tts(w["example_ko"], VOICE_KO, xko),
        )
    s = lambda ms: silence(tmp, ms)
    tail, lead = s(300), s(LEAD_MS)
    recipes = {
        "w": [lead, en, tail],
        "x": [lead, xen, tail],
        "ek": [lead, en, s(800), ko, s(800), en, s(1200)],
        "ke": [lead, ko, s(2000), en, s(500), en, s(1200)],
        "ex": [lead, xen, s(700), xko, s(1200)],
    }
    for v, parts in recipes.items():
        await asyncio.to_thread(concat, parts, OUT / f"{wid}_{v}.mp3")
    # 천천히 듣기용: 음 높이는 그대로, 속도만 0.75배
    for v in ("w", "x"):
        await asyncio.to_thread(subprocess.run, ["ffmpeg", "-y", "-loglevel", "error", "-i", str(OUT / f"{wid}_{v}.mp3"),
            "-filter:a", "atempo=0.75", "-ac", "1", "-ar", "24000", "-b:a", "48k", str(OUT / f"{wid}_{v}s.mp3")], check=True)
    print(f"  ✓ {wid} {spoken(w)}")


async def main():
    OUT.mkdir(exist_ok=True)
    words = []
    for f in sorted(DATA.glob("words_*.json")):
        words += json.loads(f.read_text(encoding="utf-8"))["words"]
    old = json.loads(MANIFEST.read_text(encoding="utf-8")).get("files", {}) if MANIFEST.exists() else {}

    todo = [w for w in words
            if old.get(w["id"]) != word_hash(w)
            or not all((OUT / f"{w['id']}_{v}.mp3").exists() for v in ("w", "x", "ek", "ke", "ex", "ws", "xs"))]
    print(f"단어 {len(words)}개 중 새로 만들 단어 {len(todo)}개")

    files = {w["id"]: old[w["id"]] for w in words if w["id"] in old and w not in todo}
    failed = []
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        sem = asyncio.Semaphore(CONCURRENCY)
        results = await asyncio.gather(*(build_word(w, tmp, sem) for w in todo), return_exceptions=True)
        for w, r in zip(todo, results):
            if isinstance(r, Exception):
                failed.append(w["id"]); print(f"  ✗ {w['id']}: {r}", file=sys.stderr)
            else:
                files[w["id"]] = word_hash(w)

    # 단어장에서 빠진 단어의 음성 파일 정리
    ids = {w["id"] for w in words}
    for p in OUT.glob("*.mp3"):
        if p.stem.rsplit("_", 1)[0] not in ids:
            p.unlink()

    MANIFEST.write_text(json.dumps({"version": FORMAT_VERSION, "files": dict(sorted(files.items()))},
                                   ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"완료: {len(files)}개 단어 음성 준비됨" + (f", 실패 {len(failed)}개 (다음 실행 때 재시도)" if failed else ""))


if __name__ == "__main__":
    asyncio.run(main())
