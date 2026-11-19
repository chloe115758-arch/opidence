-- Opidence 2단계: 테이블 4개와 RLS
-- Supabase SQL Editor에 전체를 붙여 넣고 한 번 실행한다. 중간에 실패하면 아무것도 만들어지지 않는다.
-- 구조 설명은 docs/db.md에 있다.

begin;

-- ───────────── 테이블 ─────────────

-- 전사본: 인터뷰 파일 1개 = 1행. 같은 사용자가 같은 참가자 라벨을 두 번 올리는 것을 막는다.
create table public.transcripts (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  participant_label text not null check (participant_label ~ '^[A-Z]$'),
  meta              text not null default '',
  char_count        integer not null check (char_count between 1 and 10000),
  created_at        timestamptz not null default now(),
  unique (owner_id, participant_label),
  unique (id, owner_id) -- 아래 테이블이 (전사본, 소유자)를 함께 참조하게 하려고 둔다
);

-- 발언: 전사본의 한 줄 = 1행. 화자가 참가자·진행자 둘 중 하나가 아니거나 ID 형식이 틀린 행을 막는다.
create table public.utterances (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid(),
  transcript_id uuid not null,
  utterance_id  text not null check (utterance_id ~ '^[A-Z]-[0-9]{2,}$'),
  seq           integer not null check (seq > 0),
  speaker_role  text not null check (speaker_role in ('participant', 'moderator')),
  text          text not null check (char_length(text) between 1 and 10000),
  unique (owner_id, utterance_id),       -- 한 사용자 안에서 발언 ID(A-04)가 겹치는 것을 막는다
  unique (transcript_id, seq),           -- 한 전사본 안에서 순번이 겹치는 것을 막는다
  unique (id, owner_id, speaker_role),   -- evidence가 (발언, 소유자, 화자)를 함께 참조하게 하려고 둔다
  -- 남의 전사본에 발언을 끼워 넣는 것을 막는다. 전사본을 지우면 발언도 함께 지워진다.
  foreign key (transcript_id, owner_id) references public.transcripts (id, owner_id) on delete cascade
);

-- 인사이트: 주제 묶음 1개 = 1행. 제목 없는 묶음을 막는다.
create table public.insights (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  summary    text not null default '',
  created_at timestamptz not null default now(),
  unique (id, owner_id) -- evidence가 (인사이트, 소유자)를 함께 참조하게 하려고 둔다
);

-- 근거: AI가 돌려준 발언 ID 1개 = 1행. 인용 문장은 저장하지 않는다(화면은 utterances.text를 조인해서 보여 준다).
create table public.evidence (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid(),
  insight_id   uuid not null,
  returned_id  text not null check (char_length(returned_id) <= 100), -- AI가 준 문자열 그대로. 탈락한 ID도 남긴다
  utterance_pk uuid,
  -- 값이 'participant'로 고정이다. 아래 FK와 합쳐져 진행자 발언을 근거로 연결하는 것을 DB가 막는다.
  speaker_role text not null default 'participant' check (speaker_role = 'participant'),
  status       text not null check (status in ('verified', 'not_found', 'moderator')),
  -- 'verified'인데 발언이 연결되지 않았거나, 탈락했는데 발언이 연결된 행을 막는다.
  check ((status = 'verified') = (utterance_pk is not null)),
  -- 남의 인사이트에 근거를 붙이는 것을 막는다. 인사이트를 지우면 근거도 함께 지워진다.
  foreign key (insight_id, owner_id) references public.insights (id, owner_id) on delete cascade,
  -- 없는 발언, 남의 발언, 진행자 발언을 근거로 연결하는 것을 막는다. 근거로 쓰인 발언이 지워지면 근거도 지워진다.
  foreign key (utterance_pk, owner_id, speaker_role)
    references public.utterances (id, owner_id, speaker_role) on delete cascade
);

create index evidence_insight_id_idx on public.evidence (insight_id);

-- ───────────── 건수 제한 ─────────────

-- 사용자당 전사본 10건 제한. 공개 키로 API를 직접 호출해도 넘지 못하게 DB에서 막는다.
create function public.limit_transcripts() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.transcripts where owner_id = new.owner_id) >= 10 then
    raise exception '전사본은 10건까지 올릴 수 있습니다.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger transcripts_limit
  before insert on public.transcripts
  for each row execute function public.limit_transcripts();

-- ───────────── 권한 ─────────────

-- 로그인하지 않은 요청(anon)은 네 테이블에 아무것도 하지 못한다.
revoke all on public.transcripts, public.utterances, public.insights, public.evidence from anon;

-- 로그인한 사용자(익명 로그인 포함)는 조회·추가·삭제만 한다. 수정(update)은 열지 않아 저장된 원문을 고칠 수 없다.
revoke all on public.transcripts, public.utterances, public.insights, public.evidence from authenticated;
grant select, insert, delete on public.transcripts, public.utterances, public.insights, public.evidence to authenticated;

-- ───────────── RLS ─────────────

-- RLS를 켜면 정책이 허용한 행만 보인다. 정책이 없는 역할(anon)은 0행이다.
alter table public.transcripts enable row level security;
alter table public.utterances  enable row level security;
alter table public.insights    enable row level security;
alter table public.evidence    enable row level security;

-- 다른 사용자의 전사본을 보거나 지우는 것, 남의 이름으로 전사본을 넣는 것을 막는다.
create policy "내 전사본만" on public.transcripts
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- 다른 사용자의 발언 원문을 보거나 지우는 것, 남의 이름으로 발언을 넣는 것을 막는다.
create policy "내 발언만" on public.utterances
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- 다른 사용자의 인사이트를 보거나 지우는 것, 남의 이름으로 인사이트를 넣는 것을 막는다.
create policy "내 인사이트만" on public.insights
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- 다른 사용자의 근거를 보거나 지우는 것, 남의 이름으로 근거를 넣는 것을 막는다.
create policy "내 근거만" on public.evidence
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

commit;

-- ───────────── 실행 뒤 확인 (따로 실행) ─────────────
-- 1) 네 테이블 모두 rowsecurity = true 인지
--    select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
-- 2) 정책 4개가 authenticated 역할에만 걸려 있는지
--    select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public' order by tablename;
-- 3) anon 권한이 없고 authenticated는 SELECT·INSERT·DELETE만 있는지
--    select table_name, grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and grantee in ('anon', 'authenticated') order by table_name, grantee, privilege_type;
