-- =====================================================================
-- 지후 English — 가족 초대 코드 (schema.sql 다음에 한 번 실행)
--  · 부모 페이지에서 초대 코드를 만들면, 그 코드가 있어야만 새 계정 가입 가능
--  · 가입한 계정은 바로 지후 기록을 같이 봄 (가족 구성원)
--  · 여러 번 실행해도 안전
-- =====================================================================

-- 1) 가족 구성원: 학습자(지후)를 같이 보는 계정들
create table if not exists learner_members (
  learner_id uuid not null references learners(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now(),
  primary key (learner_id, user_id)
);

-- 처음 만든 계정(학습자 주인)도 가족 목록에 넣기
insert into learner_members (learner_id, user_id, email)
select l.id, l.owner_id, u.email from learners l join auth.users u on u.id = l.owner_id
on conflict do nothing;

-- 2) 초대 코드 (한 번만 사용, 3일 뒤 만료)
create table if not exists family_invites (
  code       text primary key,
  learner_id uuid not null references learners(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 days',
  used_by    uuid references auth.users(id) on delete set null,
  used_email text,
  used_at    timestamptz
);

-- 3) 내가 볼 수 있는 학습자 목록 (처음 만든 계정 + 초대받은 가족)
create or replace function public.my_learner_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from learners where owner_id = auth.uid()
  union
  select learner_id from learner_members where user_id = auth.uid()
$$;
revoke all on function public.my_learner_ids() from public, anon;
grant execute on function public.my_learner_ids() to authenticated;

-- 4) 보안 규칙(RLS)을 "가족이면 볼 수 있음"으로 교체
alter table learner_members enable row level security;
alter table family_invites  enable row level security;

drop policy if exists "own learners" on learners;
drop policy if exists "family learners read" on learners;
drop policy if exists "family learners update" on learners;
drop policy if exists "family learners insert" on learners;
drop policy if exists "owner learners delete" on learners;
create policy "family learners read"   on learners for select using (id in (select my_learner_ids()));
create policy "family learners update" on learners for update using (id in (select my_learner_ids())) with check (id in (select my_learner_ids()));
create policy "family learners insert" on learners for insert with check (owner_id = auth.uid());
create policy "owner learners delete"  on learners for delete using (owner_id = auth.uid());

do $$
declare t text; p text;
begin
  foreach t in array array['word_progress','study_sessions','answer_logs','day_progress','rewards'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on %I', p, t);
    end loop;
    execute format('create policy "family rows" on %I for all using (learner_id in (select my_learner_ids())) with check (learner_id in (select my_learner_ids()))', t);
  end loop;
end $$;

drop policy if exists "family members read" on learner_members;
create policy "family members read" on learner_members for select using (learner_id in (select my_learner_ids()));
drop policy if exists "family invites read" on family_invites;
create policy "family invites read" on family_invites for select using (learner_id in (select my_learner_ids()));
-- 초대 코드 만들기·사용은 아래 함수로만 (직접 insert/update 불가)

-- 5) 초대 코드 만들기 (부모 페이지 버튼)
create or replace function public.create_family_invite(p_learner uuid)
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare c text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if auth.uid() is null or p_learner not in (select my_learner_ids()) then
    raise exception 'not allowed';
  end if;
  loop
    c := '';
    for i in 1..8 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from family_invites f where f.code = c);
  end loop;
  insert into family_invites (code, learner_id, created_by) values (c, p_learner, auth.uid());
  return query select f.code, f.expires_at from family_invites f where f.code = c;
end $$;
revoke all on function public.create_family_invite(uuid) from public, anon;
grant execute on function public.create_family_invite(uuid) to authenticated;

-- 6) 가입 전에 코드가 맞는지 확인 (가입 화면에서 사용)
create or replace function public.check_family_invite(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_invites
                 where code = upper(trim(p_code)) and used_at is null and expires_at > now())
$$;
grant execute on function public.check_family_invite(text) to anon, authenticated;

-- 7) 가입할 때 자동 검사: 올바른 초대 코드가 없으면 가입 자체를 막음
--    (코드 없이 계정을 만들어야 하면 이 트리거를 잠시 끄면 됨:
--     alter table auth.users disable trigger on_auth_user_created_family;)
create or replace function public.handle_family_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare c text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', ''))); inv family_invites;
begin
  select * into inv from family_invites
   where code = c and used_at is null and expires_at > now() for update;
  if not found then
    raise exception 'invalid invite code';
  end if;
  insert into learner_members (learner_id, user_id, email) values (inv.learner_id, new.id, new.email)
    on conflict do nothing;
  update family_invites set used_by = new.id, used_email = new.email, used_at = now() where code = c;
  return new;
end $$;

drop trigger if exists on_auth_user_created_family on auth.users;
create trigger on_auth_user_created_family
  after insert on auth.users for each row execute function public.handle_family_signup();
