"""학년별 단어장 생성 공통 모듈 (5·6학년)
- 하루 7개, 단원(day) 번호는 학년별로 이어짐: 4학년 1~30, 5학년 31~60, 6학년 61~90
- 검사: 같은 학년 안 중복(단어·뜻·이모지), 다른 학년과 단어·이모지 중복, 예문에 단어 포함, 교육과정 초등 권장 어휘 대조
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_kice import load_list, check  # noqa: E402


def key_in_example(word, example):
    ex = re.findall(r"[a-z']+", example.lower())
    for t in re.findall(r"[a-z']+", word.lower()):
        if any(e == t or (e.startswith(t) and len(e) - len(t) <= 3) for e in ex):
            return True
    return False


def build(level, title, unit_start, prefix, days, source):
    out_path = DATA / f"words_{level}.json"
    others = []
    for f in sorted(DATA.glob("words_*.json")):
        if f != out_path:
            others += json.loads(f.read_text(encoding="utf-8"))["words"]
    other_words = {w["word"].lower(): w["id"] for w in others}
    other_emoji = {w["emoji"]: w["id"] for w in others}

    words, problems = [], []
    seen_w, seen_m, seen_e = {}, {}, {}
    n = 0
    for k, (theme, items) in enumerate(days):
        unit = unit_start + k
        if len(items) != 7:
            problems.append(f"[{theme}] {len(items)}개 (7개여야 함)")
        for (w, t, m, e, ex, exko) in items:
            n += 1
            lw = w.lower()
            if lw in seen_w: problems.append(f"학년 안 단어 중복: {w}")
            if m in seen_m: problems.append(f"학년 안 뜻 중복: {m} ({w} / {seen_m[m]})")
            if e in seen_e: problems.append(f"학년 안 이모지 중복: {e} ({w} / {seen_e[e]})")
            if lw in other_words: problems.append(f"다른 학년에 이미 있음: {w} ({other_words[lw]})")
            if e in other_emoji: problems.append(f"다른 학년과 이모지 중복: {e} ({w} / {other_emoji[e]})")
            if not key_in_example(w, ex): problems.append(f"예문에 단어 없음: {w} / {ex}")
            seen_w[lw] = 1; seen_m[m] = w; seen_e[e] = w
            words.append({"id": f"{prefix}-{n:04d}", "day": unit, "word": w, "type": "idiom" if t == "i" else "word",
                          "meaning": m, "theme": theme, "emoji": e, "example": ex, "example_ko": exko, "publishers": None})

    _, alls = load_list()
    outside = [(w["word"], bad) for w, k, bad in check(words, alls) if k == "밖"]
    for word, bad in outside:
        problems.append(f"초등 권장 어휘 밖: {word} {bad}")

    if problems:
        print("\n".join(problems))
        print(f"문제 {len(problems)}건 — 저장하지 않음")
        sys.exit(1)
    out_path.write_text(json.dumps({"version": 1, "level": level, "title": title, "per_day": 7, "source": source,
                                    "words": words}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{title}: {len(words)}개, 단원 {unit_start}~{unit_start + len(days) - 1} → {out_path.name}")
