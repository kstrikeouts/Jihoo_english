// 데이터 계층 — Supabase(클라우드) / 체험 모드(이 폰만) 공통 인터페이스
// 모든 기록은 먼저 폰(localStorage)에 저장하고, 전송 대기열(queue)을 통해
// 연결될 때 Supabase 로 보낸다. 지하철처럼 끊겨도 기록이 사라지지 않음.
import { CONFIG } from "./config.js";

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("저장 실패", e); } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const QKEY = "je.queue";
const DEADKEY = "je.queue.dead";
const PAGE = 1000;

export const DB = {
  mode: "local",          // 'local' | 'cloud'
  client: null,
  user: null,
  learner: null,
  _flushing: false,
  onSync: null,           // (pendingCount) => void

  get configured() { return !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY); },

  async init() {
    if (this.configured) {
      this.mode = "cloud";
      if (window.supabase?.createClient) {
        this.client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, storageKey: "je.auth" },
        });
        try {
          const { data } = await this.client.auth.getSession();
          this.user = data.session?.user || null;
        } catch { this.user = null; }
      }
      // 오프라인으로 시작해 라이브러리를 못 불러와도, 이전에 로그인했으면 계속 사용
      if (!this.user) this.user = LS.get("je.user", null);
      if (this.user) LS.set("je.user", { id: this.user.id, email: this.user.email });
    }
    window.addEventListener("online", () => this.flush());
    setInterval(() => this.flush(), 30000);
    return this;
  },

  needsLogin() { return this.mode === "cloud" && !this.user; },

  async signIn(email, password) {
    if (!this.client) throw new Error("인터넷 연결을 확인해 주세요.");
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === "Invalid login credentials" ? "이메일 또는 비밀번호가 맞지 않아요." : error.message);
    this.user = data.user;
    LS.set("je.user", { id: data.user.id, email: data.user.email });
  },

  async signOut() {
    try { await this.client?.auth.signOut(); } catch {}
    this.user = null; this.learner = null;
    LS.del("je.user"); LS.del("je.learner");
  },

  // ── 학습자 ────────────────────────────────────────────────
  async loadLearner() {
    if (this.mode === "local") {
      this.learner = LS.get("je.learner", null) || {
        id: "local", name: CONFIG.LEARNER_NAME, grade: CONFIG.DEFAULT_GRADE,
        daily_new_target: CONFIG.DAILY_NEW, parent_pin: null, settings: {},
      };
      LS.set("je.learner", this.learner);
      return this.learner;
    }
    const cached = LS.get("je.learner", null);
    if (this.client && navigator.onLine) {
      const { data, error } = await this.client.from("learners").select("*").order("created_at").limit(1);
      if (!error) {
        if (data.length) this.learner = data[0];
        else {
          const ins = await this.client.from("learners")
            .insert({ name: CONFIG.LEARNER_NAME, grade: CONFIG.DEFAULT_GRADE, daily_new_target: CONFIG.DAILY_NEW })
            .select().single();
          if (ins.error) throw ins.error;
          this.learner = ins.data;
        }
        LS.set("je.learner", this.learner);
        return this.learner;
      }
    }
    if (cached) { this.learner = cached; return cached; }
    throw new Error("처음 한 번은 인터넷 연결이 필요해요.");
  },

  async updateLearner(patch) {
    this.learner = { ...this.learner, ...patch };
    LS.set("je.learner", this.learner);
    if (this.mode === "cloud") this.enqueue("learners", "update", { id: this.learner.id, ...patch }, null, "learner");
    await this.flush();
  },

  k(name) { return `je.${this.learner.id}.${name}`; },

  // ── 단어 진도 ─────────────────────────────────────────────
  async loadProgress() {
    const local = LS.get(this.k("progress"), {});
    if (this.mode === "cloud" && this.client && navigator.onLine) {
      try {
        const remote = await this.selectAll("word_progress", (q) => q.eq("learner_id", this.learner.id));
        for (const r of remote) {
          const l = local[r.word_id];
          if (!l || (r.last_reviewed_at || r.first_learned_at) > (l.last_reviewed_at || l.first_learned_at)) local[r.word_id] = r;
        }
        LS.set(this.k("progress"), local);
      } catch (e) { console.warn("진도 불러오기 실패 — 폰 기록 사용", e); }
    }
    return local;
  },

  saveProgress(p) {
    const map = LS.get(this.k("progress"), {});
    map[p.word_id] = p;
    LS.set(this.k("progress"), map);
    this.enqueue("word_progress", "upsert", p, "learner_id,word_id", `wp:${p.word_id}`);
  },

  // ── 세션 · 응답 로그 ──────────────────────────────────────
  saveSession(s) {
    const list = LS.get(this.k("sessions"), []);
    const i = list.findIndex((x) => x.id === s.id);
    if (i >= 0) list[i] = s; else list.push(s);
    LS.set(this.k("sessions"), list.slice(-400));
    this.enqueue("study_sessions", "upsert", s, "id", `ss:${s.id}`);
  },

  logAnswer(a) {
    const list = LS.get(this.k("answers"), []);
    list.push(a);
    LS.set(this.k("answers"), list.slice(-3000));
    this.enqueue("answer_logs", "upsert", a, "client_id", `al:${a.client_id}`, true);
  },

  async loadSessions() {
    let list = LS.get(this.k("sessions"), []);
    if (this.mode === "cloud" && this.client && navigator.onLine) {
      try {
        const since = new Date(Date.now() - 400 * 864e5).toISOString();
        const remote = await this.selectAll("study_sessions", (q) =>
          q.eq("learner_id", this.learner.id).gte("started_at", since));
        const byId = Object.fromEntries(remote.map((r) => [r.id, r]));
        for (const s of list) byId[s.id] = s; // 아직 전송 안 된 폰 기록 우선
        list = Object.values(byId).sort((a, b) => (a.started_at < b.started_at ? -1 : 1));
        LS.set(this.k("sessions"), list.slice(-400));
      } catch (e) { console.warn(e); }
    }
    return list;
  },

  async loadAnswers(days = 120) {
    if (this.mode === "cloud" && this.client && navigator.onLine) {
      const since = new Date(Date.now() - days * 864e5).toISOString();
      const { data, error } = await this.client.from("answer_logs").select("*")
        .eq("learner_id", this.learner.id).gte("answered_at", since)
        .order("answered_at", { ascending: false }).limit(3000);
      if (!error) return data;
    }
    return LS.get(this.k("answers"), []).slice().reverse();
  },

  // ── Day 진행 (하루 7개 묶음 · 테스트 통과 기록) ──────────
  async loadDays() {
    const local = LS.get(this.k("days"), {});
    if (this.mode === "cloud" && this.client && navigator.onLine) {
      try {
        const remote = await this.selectAll("day_progress", (q) => q.eq("learner_id", this.learner.id));
        for (const r of remote) {
          const l = local[r.day];
          if (!l || (r.updated_at || "") > (l.updated_at || "")) local[r.day] = r;
        }
        LS.set(this.k("days"), local);
      } catch (e) { console.warn("Day 기록 불러오기 실패 — 폰 기록 사용", e); }
    }
    return local;
  },
  saveDay(rec) {
    const map = LS.get(this.k("days"), {});
    map[rec.day] = rec;
    LS.set(this.k("days"), map);
    this.enqueue("day_progress", "upsert", rec, "learner_id,day", `dp:${rec.day}`);
  },

  // ── 보상 ──────────────────────────────────────────────────
  async loadRewards() {
    if (this.mode === "cloud" && this.client && navigator.onLine) {
      const { data, error } = await this.client.from("rewards").select("*")
        .eq("learner_id", this.learner.id).order("created_at");
      if (!error) { LS.set(this.k("rewards"), data); return data; }
    }
    return LS.get(this.k("rewards"), []);
  },
  saveReward(r) {
    const list = LS.get(this.k("rewards"), []);
    const i = list.findIndex((x) => x.id === r.id);
    if (i >= 0) list[i] = r; else list.push(r);
    LS.set(this.k("rewards"), list);
    this.enqueue("rewards", "upsert", r, "id", `rw:${r.id}`);
    this.flush();
  },
  deleteReward(id) {
    LS.set(this.k("rewards"), LS.get(this.k("rewards"), []).filter((r) => r.id !== id));
    this.enqueue("rewards", "delete", { id }, null, `rw:${id}`);
    this.flush();
  },

  // ── 전송 대기열 ───────────────────────────────────────────
  enqueue(table, op, row, onConflict, key, ignoreDuplicates = false) {
    if (this.mode !== "cloud") return;
    const q = LS.get(QKEY, []);
    const existing = key ? q.findIndex((x) => x.key === key) : -1;
    const item = { table, op, row, onConflict, key, ignoreDuplicates, attempts: 0 };
    if (existing >= 0) q[existing] = { ...item, attempts: q[existing].attempts };
    else q.push(item);
    LS.set(QKEY, q);
    this.onSync?.(q.length);
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), 1500);
  },

  pending() { return LS.get(QKEY, []).length; },

  async flush() {
    if (this.mode !== "cloud" || !this.client || !navigator.onLine || this._flushing) return;
    this._flushing = true;
    try {
      for (let loop = 0; loop < 200; loop++) {
        const q = LS.get(QKEY, []);
        if (!q.length) break;
        // 같은 테이블에 연속으로 쌓인 upsert 는 한 번에 묶어서 전송
        const head = q[0];
        let n = 1;
        if (head.op === "upsert") {
          while (n < q.length && n < 200 && q[n].table === head.table && q[n].op === "upsert" &&
                 q[n].onConflict === head.onConflict) n++;
        }
        const batch = q.slice(0, n);
        const err = await this.send(head, batch.map((b) => b.row));
        if (!err) { removeSent(batch); continue; }
        if (isNetworkError(err)) break;
        if (/jwt|token|auth/i.test(err.message || "")) { // 로그인 만료 → 갱신 후 다음 기회에
          try { await this.client.auth.refreshSession(); } catch {}
          break;
        }
        // 데이터 오류 → 하나씩 보내 문제 항목만 골라냄. 5번 실패하면 따로 보관(대기열이 영구히 막히지 않게)
        let stop = false;
        for (const b of batch) {
          const e = n === 1 ? err : await this.send(b, [b.row]);
          if (!e) { removeSent([b]); continue; }
          if (!isNetworkError(e)) markFailed(b, e);
          stop = true; break;  // 순서를 지키기 위해 실패 항목에서 멈추고 다음 전송 때 재시도
        }
        if (stop) break;
      }
    } finally {
      this._flushing = false;
      this.onSync?.(this.pending());
    }
  },

  async send(item, rows) {
    try {
      const t = this.client.from(item.table);
      let res;
      if (item.op === "upsert") res = await t.upsert(rows, { onConflict: item.onConflict, ignoreDuplicates: item.ignoreDuplicates });
      else if (item.op === "update") { const { id, ...patch } = rows[0]; res = await t.update(patch).eq("id", id); }
      else if (item.op === "delete") res = await t.delete().eq("id", rows[0].id);
      return res.error || null;
    } catch (e) { return { message: String(e?.message || e), network: true }; }
  },

  async selectAll(table, build) {
    let from = 0, out = [];
    for (;;) {
      const { data, error } = await build(this.client.from(table).select("*")).range(from, from + PAGE - 1);
      if (error) throw error;
      out = out.concat(data);
      if (data.length < PAGE) return out;
      from += PAGE;
    }
  },
};

function isNetworkError(e) {
  return e.network || !navigator.onLine || /fetch|network|load failed|timeout/i.test(e.message || "");
}
// 전송 성공 항목 제거 — 전송 중 같은 key 가 새 내용으로 갱신됐으면 남겨 둔다
function removeSent(items) {
  const sent = new Map(items.map((b) => [b.key, JSON.stringify(b.row)]));
  LS.set(QKEY, LS.get(QKEY, []).filter((x) => !(sent.has(x.key) && sent.get(x.key) === JSON.stringify(x.row))));
}
function markFailed(b, e) {
  const q = LS.get(QKEY, []);
  const i = q.findIndex((x) => x.key === b.key);
  if (i < 0) return;
  q[i].attempts = (q[i].attempts || 0) + 1;
  if (q[i].attempts >= 5) moveDead(q.splice(i, 1)[0], e);
  LS.set(QKEY, q);
}
function moveDead(item, error) {
  const dead = LS.get(DEADKEY, []);
  dead.push({ ...item, error: error?.message, at: new Date().toISOString() });
  LS.set(DEADKEY, dead.slice(-200));
  console.warn("전송 실패 항목 보관:", item, error);
}
