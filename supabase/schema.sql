-- =====================================================================
-- 지후 English · Supabase 스키마 v0.1
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run
-- 단어 데이터(뜻·예문·음성)는 GitHub 의 JSON/MP3 로 관리하고,
-- DB 에는 "학습 이력과 진도"만 저장한다. word_id 로 연결.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 학습자 (부모 계정 1개 아래 자녀 N명 확장 가능)
-- ---------------------------------------------------------------------
create table if not exists learners (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid()
                   references auth.users(id) on delete cascade,
  name             text not null,
  grade            smallint not null default 4 check (grade between 3 and 6),
  daily_new_target smallint not null default 7,
  parent_pin       text,                      -- 부모 화면 진입용 4자리 (편의 기능, 보안 아님)
  settings         jsonb not null default '{}'::jsonb,  -- 듣기 속도, 반복 횟수 등
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. 단어별 진도 (라이트너 상자)
--    box 1~6 : 복습 단계 / box 7 : 졸업
--    간격(일) : 1→1, 2→3, 3→7, 4→14, 5→30, 6→60
-- ---------------------------------------------------------------------
create table if not exists word_progress (
  learner_id       uuid not null references learners(id) on delete cascade,
  word_id          text not null,               -- 예: 'g4-0001'
  box              smallint not null default 1 check (box between 1 and 7),
  next_due         date not null default ((now() at time zone 'Asia/Seoul')::date + 1),
  correct_count    int not null default 0,
  wrong_count      int not null default 0,
  first_learned_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  graduated_at     timestamptz,
  primary key (learner_id, word_id)
);
create index if not exists idx_wp_due on word_progress (learner_id, next_due);

-- ---------------------------------------------------------------------
-- 3. 학습 세션 (한 번 앱을 켜서 학습한 단위)
--    id 는 폰에서 crypto.randomUUID() 로 생성 → 오프라인에서도 기록 가능
-- ---------------------------------------------------------------------
create table if not exists study_sessions (
  id             uuid primary key,
  learner_id     uuid not null references learners(id) on delete cascade,
  kind           text not null check (kind in ('lesson','review','speaking','audio','boss')),
  started_at     timestamptz not null,
  ended_at       timestamptz,
  new_words      smallint not null default 0,
  reviewed_words smallint not null default 0,
  correct        smallint not null default 0,
  xp             int not null default 0,
  audio_seconds  int not null default 0,       -- 듣기 모드 재생 시간
  audio_words    int not null default 0        -- 듣기 모드에서 들은 단어 수
);
create index if not exists idx_ss_learner_time on study_sessions (learner_id, started_at desc);

-- ---------------------------------------------------------------------
-- 4. 문항별 응답 로그 (부모 화면 "무엇을 틀렸나" 의 근거)
-- ---------------------------------------------------------------------
create table if not exists answer_logs (
  id          bigint generated always as identity primary key,
  client_id   uuid unique not null,            -- 오프라인 재전송 시 중복 방지
  session_id  uuid references study_sessions(id) on delete cascade,
  learner_id  uuid not null references learners(id) on delete cascade,
  word_id     text not null,
  mode        text not null check (mode in
               ('listen_pick','meaning_pick','spell','speak','chunk_speak')),
  phase       text not null default 'practice'
              check (phase in ('practice','test','review')),   -- 반복 연습 / Day 테스트 / 복습
  is_correct  boolean not null,
  hint_used   boolean not null default false,
  speak_score smallint check (speak_score between 0 and 3),  -- 발음 별점
  transcript  text,                            -- 음성 인식 결과 (말하기 문항)
  box_before  smallint,
  box_after   smallint,
  answered_at timestamptz not null default now()
);
create index if not exists idx_al_learner_time on answer_logs (learner_id, answered_at desc);

-- ---------------------------------------------------------------------
-- 5. 부모 설정 보상
-- ---------------------------------------------------------------------
create table if not exists rewards (
  id             uuid primary key default gen_random_uuid(),
  learner_id     uuid not null references learners(id) on delete cascade,
  title          text not null,                -- 예: '주말 야구장 가기'
  condition_type text not null check (condition_type in ('streak','graduated','xp','days')),
  target         int not null,                 -- 예: 30 (30일 연속)
  achieved_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Day 진행 — 학습 Day(7개) 5일 → 복습 Day(35개) 1일. 반복 학습 → 테스트를 모두 맞혀야 통과
-- ---------------------------------------------------------------------
create table if not exists day_progress (
  learner_id    uuid not null references learners(id) on delete cascade,
  day           smallint not null,                 -- Day 1 ~ 36 (학습 5일 + 복습 Day 1일 반복)
  kind          text not null default 'learn' check (kind in ('learn','review')),
  word_ids      text[] not null,
  warmup_at     timestamptz,                       -- 어제 단어 워밍업 복습 끝낸 시각
  status        text not null default 'learning'
                check (status in ('learning','testing','passed')),
  started_at    timestamptz,
  learned_at    timestamptz,                       -- 반복 학습 끝난 시각
  passed_at     timestamptz,                       -- 테스트 통과 시각
  test_rounds   smallint not null default 0,       -- 테스트 도전 횟수 (재도전 포함)
  first_correct smallint,                          -- 첫 도전 정답 수
  first_total   smallint,                          -- 첫 도전 문제 수
  updated_at    timestamptz not null default now(),
  primary key (learner_id, day)
);

-- =====================================================================
-- RLS : 로그인한 부모 계정의 자녀 데이터만 읽고 쓸 수 있음
-- (anon key 가 GitHub Pages 에 공개되므로 반드시 켜야 함)
-- =====================================================================
alter table learners       enable row level security;
alter table word_progress  enable row level security;
alter table study_sessions enable row level security;
alter table answer_logs    enable row level security;
alter table rewards        enable row level security;
alter table day_progress   enable row level security;

create policy "own learners" on learners for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own progress" on word_progress for all
  using      (learner_id in (select id from learners where owner_id = auth.uid()))
  with check (learner_id in (select id from learners where owner_id = auth.uid()));

create policy "own sessions" on study_sessions for all
  using      (learner_id in (select id from learners where owner_id = auth.uid()))
  with check (learner_id in (select id from learners where owner_id = auth.uid()));

create policy "own answers" on answer_logs for all
  using      (learner_id in (select id from learners where owner_id = auth.uid()))
  with check (learner_id in (select id from learners where owner_id = auth.uid()));

create policy "own days" on day_progress for all
  using      (learner_id in (select id from learners where owner_id = auth.uid()))
  with check (learner_id in (select id from learners where owner_id = auth.uid()));

create policy "own rewards" on rewards for all
  using      (learner_id in (select id from learners where owner_id = auth.uid()))
  with check (learner_id in (select id from learners where owner_id = auth.uid()));

-- =====================================================================
-- 부모 대시보드용 뷰 (security_invoker = RLS 그대로 적용)
-- =====================================================================

-- 일별 요약 : 달력 히트맵 · 학습 시간 · 연속일 계산
create or replace view v_daily_summary with (security_invoker = true) as
select learner_id,
       (started_at at time zone 'Asia/Seoul')::date                       as study_date,
       count(*)                                                            as sessions,
       sum(new_words)                                                      as new_words,
       sum(reviewed_words)                                                 as reviewed_words,
       sum(correct)                                                        as correct,
       sum(xp)                                                             as xp,
       sum(audio_seconds)                                                  as audio_seconds,
       coalesce(sum(extract(epoch from (ended_at - started_at))), 0)::int  as study_seconds
from study_sessions
group by learner_id, (started_at at time zone 'Asia/Seoul')::date;

-- 상자 분포 : "외우는 중 / 거의 앎 / 졸업" 막대그래프
create or replace view v_box_status with (security_invoker = true) as
select learner_id, box, count(*) as words
from word_progress
group by learner_id, box;

-- 약한 단어 : 오답률 높은 순
create or replace view v_weak_words with (security_invoker = true) as
select learner_id, word_id, box, correct_count, wrong_count,
       round(wrong_count::numeric / nullif(correct_count + wrong_count, 0), 2) as wrong_rate,
       last_reviewed_at
from word_progress
where wrong_count > 0;

-- 주간 발음 점수 추이
create or replace view v_speaking_weekly with (security_invoker = true) as
select learner_id,
       date_trunc('week', answered_at at time zone 'Asia/Seoul')::date as week_start,
       round(avg(speak_score), 2)                                       as avg_score,
       count(*)                                                         as attempts
from answer_logs
where mode in ('speak','chunk_speak') and speak_score is not null
group by learner_id, date_trunc('week', answered_at at time zone 'Asia/Seoul');
