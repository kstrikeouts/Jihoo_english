"""단어장 ↔ 교육과정 초등 권장 어휘(800) 대조
사용: python tools/check_kice.py [data/words_g4.json]
분류: 목록(그대로·굴절형) / 파생·합성(목록 단어 + 접사, 목록 단어끼리 합친 말) / 예외 허용(요일·월·숫자 등) / 목록 밖
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "source" / "kice_2022_elementary.txt"

def load_list():
    heads, alls = [], set()
    for line in SRC.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"): continue
        forms = [f.strip().lower() for f in re.split(r"[/(),]", line) if f.strip()]
        heads.append(forms[0]); alls.update(forms)
    return heads, alls

EXCEPT = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "fifteen", "fifty", "english",
          "korea", "korean", "mr", "ms", "tv", "o'clock", "oh", "wow"}
IRREG = {"teeth": "tooth", "feet": "foot", "children": "child", "men": "man", "women": "woman", "mice": "mouse",
         "went": "go", "ate": "eat", "saw": "see", "got": "get", "was": "be", "were": "be", "is": "be", "am": "be", "are": "be",
         "bought": "buy", "made": "make", "flew": "fly", "ran": "run", "began": "begin", "drew": "draw", "wrote": "write",
         "caught": "catch", "better": "good", "best": "good", "worse": "bad", "worst": "bad", "threw": "throw", "rode": "ride", "an": "a", "i'm": "i", "doing": "do", "has": "have", "had": "have"}
INFL = ["", "s", "es", "ed", "d", "ing"]
DERIV = ["er", "or", "y", "ly", "ful", "less", "ness", "ment", "ish", "ist", "ian", "en", "ty", "th", "al", "ion", "tion", "ation",
         "able", "ible", "ive", "ous", "ic", "est", "ier", "iest", "ily"]
PREF = ["un", "dis", "re", "in", "im", "non", "mis", "pre"]

SPECIAL = {"scientist": "science", "scientific": "science"}

def stems(w, depth=2):
    out = {w}
    if w in SPECIAL: out.add(SPECIAL[w])
    if w in IRREG: out.add(IRREG[w])
    for suf in INFL + DERIV:
        if suf and w.endswith(suf) and len(w) - len(suf) >= 2:
            b = w[: -len(suf)]
            out |= {b, b + "e"}
            if b.endswith("i"): out.add(b[:-1] + "y")
            if len(b) > 2 and b[-1] == b[-2]: out.add(b[:-1])
    for p in PREF:
        if w.startswith(p) and len(w) - len(p) >= 3: out.add(w[len(p):])
    if depth > 1:  # 접사가 두 번 붙은 말 (congratulations = congratulate + ion + s)
        for b in list(out - {w}):
            out |= stems(b, depth - 1)
    return out

def classify(token, alls):
    t = token.lower().strip("'").split("'")[0]  # 줄임말: that's → that
    if t in EXCEPT: return "예외"
    if t in alls or (t in IRREG and IRREG[t] in alls): return "목록"
    if any(s in alls for s in stems(t) if s != t):
        direct = any(t == s + x or t == s + "e" + x[1:] for s in alls for x in INFL if x)
        return "목록" if direct else "파생"
    for i in range(2, len(t) - 1):  # 합성어: 앞뒤 모두 목록 단어 (maybe = may + be)
        a, b = t[:i], t[i:]
        if (a in alls or stems(a) & alls) and (b in alls or stems(b) & alls): return "합성"
    return "밖"

def check(words, alls):
    rows = []
    for w in words:
        toks = re.findall(r"[A-Za-z']+", w["word"])
        cls = [classify(t, alls) for t in toks]
        worst = "밖" if "밖" in cls else "파생" if "파생" in cls or "합성" in cls else "예외" if all(c == "예외" for c in cls) else "목록"
        rows.append((w, worst, [t for t, c in zip(toks, cls) if c == "밖"]))
    return rows

if __name__ == "__main__":
    path = ROOT / (sys.argv[1] if len(sys.argv) > 1 else "data/words_g4.json")
    words = json.loads(path.read_text(encoding="utf-8"))["words"]
    heads, alls = load_list()
    rows = check(words, alls)
    from collections import Counter
    c = Counter(r[1] for r in rows)
    print(f"초등 권장 어휘 {len(heads)}개 기준 · 단어장 {len(words)}개 → " + ", ".join(f"{k} {v}" for k, v in c.items()))
    for w, k, bad in rows:
        if k in ("밖", "파생"): print(f"  [{k}] Day {w.get('day')} {w['word']}  {bad if bad else ''}")
