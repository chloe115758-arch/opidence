-- Opidence 3단계: 분석 기록, 하루 10회 제한, 인사이트를 한 번에 교체하는 함수
-- Supabase SQL Editor에 전체를 붙여 넣고 한 번 실행한다. 중간에 실패하면 아무것도 바뀌지 않는다.
-- 0001_init.sql을 먼저 실행한 상태여야 한다. 구조 설명은 docs/db.md에 있다.

begin;

-- ───────────── 표시 순서 ─────────────

-- AI가 돌려준 순서를 화면에서 그대로 보여 주려고 둔다. (한 번에 저장하면 created_at이 모두 같아 순서를 알 수 없다)
alter table public.insights add column position integer not null default 0;
alter table public.evidence add column position integer not null default 0;

-- ───────────── 분석 기록 ─────────────

-- 분석 기록: "분석하기" 한 번 = 1행. OpenAI를 호출하기 직전에 넣고, 끝나면 결과를 채운다.
-- 다시 분석하면 insights·evidence는 지워지지만 이 표는 남는다. 실패 원인 분석과 근거 일치율은 여기서 본다.
create table public.analysis_runs (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  -- running: 호출 중(또는 도중에 끊김), ok: 저장함, format_error: 응답 형식이 틀려 저장 안 함,
  -- api_error: OpenAI 호출 실패, save_error: DB 저장 실패
  status         text not null default 'running'
                 check (status in ('running', 'ok', 'format_error', 'api_error', 'save_error')),
  prompt_version text not null check (char_length(prompt_version) between 1 and 20),  -- prompts/묶음.md의 버전. 예: v1
  model          text not null check (char_length(model) between 1 and 100),          -- 환경 변수 OPENAI_MODEL의 값
  input_tokens   integer check (input_tokens >= 0),   -- 비용 계산용 실측값
  output_tokens  integer check (output_tokens >= 0),
  duration_ms    integer check (duration_ms >= 0),    -- 화면의 예상 시간 문구를 맞추는 데 쓴다
  cluster_count  integer check (cluster_count >= 0),
  id_total       integer check (id_total >= 0),        -- AI가 돌려준 발언 ID 수
  id_verified    integer check (id_verified >= 0),     -- 참가자 발언과 일치한 수. 근거 일치율 = id_verified / id_total
  id_not_found   integer check (id_not_found >= 0),    -- 원문에 없는 ID 수
  id_moderator   integer check (id_moderator >= 0),    -- 진행자 발언 ID 수
  -- 탈락한 ID 목록. 예: [{"id":"Z-99","reason":"not_found","cluster":"묶음 제목"}]
  dropped        jsonb not null default '[]'::jsonb check (jsonb_typeof(dropped) = 'array')
);

create index analysis_runs_owner_created_idx on public.analysis_runs (owner_id, created_at desc);

-- 사용자당 하루(한국 시간 자정 기준) 분석 10회 제한. 실패한 분석도 1회로 센다.
-- 동시에 두 번 눌러도, 공개 키로 API를 직접 호출해도 넘지 못하게 DB에서 막는다.
create function public.limit_analysis_runs() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now(); -- 시각을 지어내 넣는 것을 막는다
  if (
    select count(*) from public.analysis_runs
    where owner_id = new.owner_id
      and (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
  ) >= 10 then
    raise exception '오늘 분석 10회를 모두 썼습니다.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger analysis_runs_limit
  before insert on public.analysis_runs
  for each row execute function public.limit_analysis_runs();

-- 로그인하지 않은 요청(anon)은 아무것도 하지 못한다.
revoke all on public.analysis_runs from anon, authenticated;
-- 로그인한 사용자는 조회·추가만 한다. 삭제는 열지 않는다: 기록을 지워 하루 제한을 피하는 것을 막는다.
grant select, insert on public.analysis_runs to authenticated;
-- 수정은 결과 열만 연다. owner_id·created_at은 고칠 수 없어, 날짜를 옮겨 제한을 피하는 것을 막는다.
grant update (status, input_tokens, output_tokens, duration_ms, cluster_count,
              id_total, id_verified, id_not_found, id_moderator, dropped)
  on public.analysis_runs to authenticated;

alter table public.analysis_runs enable row level security;

-- 다른 사용자의 분석 기록을 보거나 고치는 것, 남의 이름으로 기록을 넣는 것을 막는다.
create policy "내 분석 기록만" on public.analysis_runs
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- ───────────── 인사이트 한 번에 교체 ─────────────

-- 기존 인사이트·근거를 지우고 새로 넣는 일을 한 트랜잭션으로 묶는다.
-- 따로 하면 저장이 중간에 실패했을 때 기존 인사이트만 사라진다. 여기서는 실패하면 전부 되돌아가 기존 것이 남는다.
-- 호출한 사용자의 권한으로 실행되므로(security invoker) RLS와 외래 키가 그대로 적용된다:
-- 남의 인사이트를 지우거나, 진행자 발언·남의 발언을 근거로 연결할 수 없다.
-- p_clusters 예:
--   [{"title":"제목","summary":"요약","evidence":[
--      {"returned_id":"A-04","status":"verified","utterance_pk":"<uuid>"},
--      {"returned_id":"Z-99","status":"not_found","utterance_pk":null}]}]
create function public.replace_insights(p_clusters jsonb) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c record;
  new_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception '로그인한 사용자만 저장할 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;

  delete from public.insights where owner_id = (select auth.uid()); -- 근거는 on delete cascade로 함께 지워진다

  for c in
    select value, ordinality from jsonb_array_elements(p_clusters) with ordinality
  loop
    insert into public.insights (title, summary, position)
    values (c.value ->> 'title', coalesce(c.value ->> 'summary', ''), c.ordinality)
    returning id into new_id;

    insert into public.evidence (insight_id, returned_id, status, utterance_pk, position)
    select new_id, e.value ->> 'returned_id', e.value ->> 'status', (e.value ->> 'utterance_pk')::uuid, e.ordinality
    from jsonb_array_elements(coalesce(c.value -> 'evidence', '[]'::jsonb)) with ordinality as e;
  end loop;
end;
$$;

revoke all on function public.replace_insights(jsonb) from public, anon;
grant execute on function public.replace_insights(jsonb) to authenticated;

commit;

-- ───────────── 실행 뒤 확인 (따로 실행) ─────────────
-- 1) analysis_runs의 rowsecurity = true 인지
--    select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
-- 2) analysis_runs에 anon 권한이 없고, authenticated는 SELECT·INSERT·UPDATE만 있고 DELETE가 없는지
--    select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'analysis_runs' order by grantee, privilege_type;
-- 3) 수정할 수 있는 열에 owner_id·created_at이 없는지 (결과 열 10개만 나와야 한다)
--    select column_name from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'analysis_runs'
--      and grantee = 'authenticated' and privilege_type = 'UPDATE' order by column_name;
