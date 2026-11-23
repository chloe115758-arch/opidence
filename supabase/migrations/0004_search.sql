-- Opidence 5단계(검색 · 찾기): 임베딩 저장, 비슷한 발언 찾기, 검색 기록과 하루 30회 제한
-- Supabase SQL Editor에 전체를 붙여 넣고 한 번 실행한다. 중간에 실패하면 아무것도 바뀌지 않는다.
-- 0001~0003을 먼저 실행한 상태여야 한다. 구조 설명은 docs/db.md에 있다.
--
-- 벡터 차원 1536은 OPENAI_EMBEDDING_MODEL=text-embedding-3-small 기준이다(2026-11-21 이 계정에서 호출해 확인).
-- 차원이 다른 모델(예: text-embedding-3-large 3072)로 바꾸려면 아래 1536 두 곳을 고치고, 임베딩을 다시 만들어야 한다.

begin;

-- ───────────── 벡터 확장 ─────────────

-- Supabase는 확장을 extensions 스키마에 둔다.
create extension if not exists vector with schema extensions;

-- ───────────── 발언 임베딩 ─────────────

-- 참가자 발언 1개 = 1행. utterances에는 update 권한이 없어(원문이 바뀌지 않는다는 보장) 임베딩은 별도 표에 둔다.
-- 임베딩은 "처음 검색할 때" 서버가 만든다. 임베딩이 없는 발언만 채운다.
create table public.utterance_embeddings (
  utterance_pk uuid primary key,
  owner_id     uuid not null default auth.uid(),
  -- 값이 'participant'로 고정이다. 아래 FK와 합쳐져 진행자 발언·남의 발언·없는 발언의 임베딩을 DB가 막는다(evidence와 같은 방식).
  speaker_role text not null default 'participant' check (speaker_role = 'participant'),
  model        text not null check (char_length(model) between 1 and 100), -- 만들 때의 OPENAI_EMBEDDING_MODEL 값
  embedding    extensions.vector(1536) not null,
  created_at   timestamptz not null default now(),
  -- 발언이 지워지면(전사본을 지우면) 임베딩도 함께 지워진다.
  foreign key (utterance_pk, owner_id, speaker_role)
    references public.utterances (id, owner_id, speaker_role) on delete cascade
);

-- 로그인하지 않은 요청(anon)은 아무것도 하지 못한다.
revoke all on public.utterance_embeddings from anon, authenticated;
-- 조회·추가·삭제만 연다. 고치는 권한은 없다: 모델을 바꾸면 지우고 다시 만든다.
grant select, insert, delete on public.utterance_embeddings to authenticated;

alter table public.utterance_embeddings enable row level security;

-- 다른 사용자의 임베딩을 보거나 지우는 것, 남의 이름으로 넣는 것을 막는다.
create policy "내 임베딩만" on public.utterance_embeddings
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- ───────────── 비슷한 발언 찾기 ─────────────

-- 질문 벡터와 가까운 참가자 발언을 가까운 순으로 돌려준다. 발언 문장은 돌려주지 않는다: 화면은 번호(utterance_pk)로 원문을 따로 읽는다.
-- p_model: 지금 설정된 임베딩 모델로 만든 것만 찾는다. 모델을 바꾼 뒤 남은 옛 임베딩은 섞이지 않는다.
-- match_count: 기본 20개, 최대 30개. similarity는 코사인 유사도(1에 가까울수록 비슷하다).
-- 호출한 사용자의 권한으로 실행되므로(security invoker) RLS가 그대로 적용되어 내 발언만 찾는다.
-- shortcut: 벡터 색인(HNSW)을 만들지 않았다. 발언이 수천 개를 넘어 느려지면 만든다.
create function public.match_utterances(
  query_embedding extensions.vector(1536),
  p_model text,
  match_count integer default 20
) returns table (utterance_pk uuid, similarity double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.utterance_pk,
         1 - (e.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.utterance_embeddings e
  where e.model = p_model
  order by e.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 30);
$$;

revoke all on function public.match_utterances(extensions.vector, text, integer) from public, anon;
grant execute on function public.match_utterances(extensions.vector, text, integer) to authenticated;

-- ───────────── 검색 기록 ─────────────

-- 검색 기록: "찾기" 한 번 = 1행. AI를 부르기 직전에 넣고, 끝나면 결과를 채운다.
-- 질문과 답변 문장은 저장하지 않는다(개인정보 방지, docs/plan.md). 횟수·토큰·시간·발언 번호와 점수만 남긴다.
-- 4일차에 "정답을 아는 질문"으로 유사도 기준선을 정할 때 hits와 cited_ids를 쓴다.
create table public.search_runs (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  -- running: 호출 중(또는 도중에 끊김), ok: 끝남(찾지 못했습니다도 정상 결과),
  -- format_error: 답변 형식이 틀려 쓰지 않음, api_error: OpenAI 호출 실패(임베딩 또는 답변)
  status          text not null default 'running'
                  check (status in ('running', 'ok', 'format_error', 'api_error')),
  prompt_version  text not null check (char_length(prompt_version) between 1 and 20),  -- prompts/근거.md의 버전
  model           text not null check (char_length(model) between 1 and 100),          -- OPENAI_MODEL
  embedding_model text not null check (char_length(embedding_model) between 1 and 100), -- OPENAI_EMBEDDING_MODEL
  embed_tokens    integer check (embed_tokens >= 0),   -- 질문 임베딩 + 이번에 새로 만든 발언 임베딩의 토큰 수
  input_tokens    integer check (input_tokens >= 0),   -- 답변 생성 토큰(실측)
  output_tokens   integer check (output_tokens >= 0),
  duration_ms     integer check (duration_ms >= 0),
  indexed_count   integer check (indexed_count >= 0),  -- 이번 검색에서 새로 임베딩한 발언 수. 첫 검색이면 0보다 크다
  retrieved_count integer check (retrieved_count >= 0), -- 가져온 발언 수
  -- 가져온 발언의 번호와 유사도, 가까운 순. 예: [{"id":"A-04","score":0.4312}]. 문장은 넣지 않는다.
  hits            jsonb not null default '[]'::jsonb check (jsonb_typeof(hits) = 'array'),
  sentence_count  integer check (sentence_count >= 0), -- AI가 쓴 요약 문장 수
  id_total        integer check (id_total >= 0),       -- AI가 돌려준 발언 번호 수
  id_verified     integer check (id_verified >= 0),
  id_not_found    integer check (id_not_found >= 0),
  id_moderator    integer check (id_moderator >= 0),
  cited_ids       text[] not null default '{}',        -- 요약이 인용한, 원문 대조를 통과한 발언 번호
  -- 탈락한 번호. 예: [{"id":"Z-99","reason":"not_found"}]. 문장은 넣지 않는다.
  dropped         jsonb not null default '[]'::jsonb check (jsonb_typeof(dropped) = 'array')
);

create index search_runs_owner_created_idx on public.search_runs (owner_id, created_at desc);

-- 사용자당 하루(한국 시간 자정 기준) 검색 30회 제한. 'api_error'(응답이 오지 않은 실패)는 세지 않는다.
-- 동시에 여러 번 눌러도, 공개 키로 API를 직접 호출해도 넘지 못하게 DB에서 막는다.
create function public.limit_search_runs() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();  -- 시각을 지어내 넣는 것을 막는다
  new.status := 'running';  -- 처음부터 'api_error'로 넣어 횟수에서 빠지는 것을 막는다
  if (
    select count(*) from public.search_runs
    where owner_id = new.owner_id
      and status <> 'api_error'
      and (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
  ) >= 30 then
    raise exception '오늘 검색 30회를 모두 썼습니다.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger search_runs_limit
  before insert on public.search_runs
  for each row execute function public.limit_search_runs();

-- 결과는 한 번만 채울 수 있다: 'running'인 기록만 고칠 수 있고 끝난 기록은 고칠 수 없다.
-- 끝난 기록의 status를 바꿔 하루 제한을 피하는 것과, 실패 원인 분석에 쓸 기록을 나중에 고치는 것을 막는다.
create function public.lock_finished_search_runs() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'running' then
    raise exception '끝난 검색 기록은 고칠 수 없습니다.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger search_runs_lock
  before update on public.search_runs
  for each row execute function public.lock_finished_search_runs();

-- 로그인하지 않은 요청(anon)은 아무것도 하지 못한다.
revoke all on public.search_runs from anon, authenticated;
-- 조회·추가만 한다. 삭제는 열지 않는다: 기록을 지워 하루 제한을 피하는 것을 막는다.
grant select, insert on public.search_runs to authenticated;
-- 수정은 결과 열만 연다. owner_id·created_at·prompt_version·model은 고칠 수 없다.
grant update (status, embed_tokens, input_tokens, output_tokens, duration_ms, indexed_count, retrieved_count,
              hits, sentence_count, id_total, id_verified, id_not_found, id_moderator, cited_ids, dropped)
  on public.search_runs to authenticated;

alter table public.search_runs enable row level security;

-- 다른 사용자의 검색 기록을 보거나 고치는 것, 남의 이름으로 기록을 넣는 것을 막는다.
create policy "내 검색 기록만" on public.search_runs
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

commit;

-- ───────────── 실행 뒤 확인 (따로 실행) ─────────────
-- 1) vector 확장이 켜졌는지
--    select extname, extversion from pg_extension where extname = 'vector';
-- 2) 새 표 두 개의 rowsecurity = true 인지
--    select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('utterance_embeddings', 'search_runs');
-- 3) anon 권한이 없고, authenticated 권한이 utterance_embeddings는 SELECT·INSERT·DELETE, search_runs는 SELECT·INSERT·UPDATE뿐인지
--    select table_name, grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name in ('utterance_embeddings', 'search_runs')
--      and grantee in ('anon', 'authenticated') order by table_name, grantee, privilege_type;
-- 4) search_runs에서 고칠 수 있는 열에 owner_id·created_at·prompt_version·model이 없는지 (결과 열 15개만 나와야 한다)
--    select column_name from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'search_runs'
--      and grantee = 'authenticated' and privilege_type = 'UPDATE' order by column_name;
-- 5) 트리거 2개(search_runs_limit, search_runs_lock)와 함수 match_utterances가 있는지
--    select tgname from pg_trigger where tgrelid = 'public.search_runs'::regclass and not tgisinternal order by tgname;
--    select proname, prosecdef as security_definer from pg_proc where proname = 'match_utterances';
