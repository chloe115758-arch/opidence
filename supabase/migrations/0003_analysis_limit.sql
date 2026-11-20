-- Opidence 3단계 보완: 하루 분석 횟수를 세는 기준 변경
-- Supabase SQL Editor에 전체를 붙여 넣고 한 번 실행한다. 0002_analysis.sql을 먼저 실행한 상태여야 한다.
--
-- 바뀌는 것
-- 1) OpenAI가 요청 자체를 거부해 응답이 오지 않은 실패(status = 'api_error': 모델 이름 오류, 형식 거부, 크레딧 부족 등)는
--    비용이 들지 않았으므로 하루 10회에서 빼지 않는다. 기록은 그대로 남는다.
--    응답이 왔는데 저장하지 못한 경우(format_error, save_error)와 성공(ok)은 1회로 센다.
-- 2) 끝난 기록은 고칠 수 없게 한다. 1)만 넣으면 자기 기록의 status를 'api_error'로 바꿔 횟수를 되돌릴 수 있기 때문이다.

begin;

-- 사용자당 하루(한국 시간 자정 기준) 분석 10회 제한. 'api_error'는 세지 않는다.
create or replace function public.limit_analysis_runs() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now(); -- 시각을 지어내 넣는 것을 막는다
  new.status := 'running';  -- 처음부터 'api_error'로 넣어 횟수에서 빠지는 것을 막는다
  if (
    select count(*) from public.analysis_runs
    where owner_id = new.owner_id
      and status <> 'api_error'
      and (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
  ) >= 10 then
    raise exception '오늘 분석 10회를 모두 썼습니다.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- 결과는 한 번만 채울 수 있다: 'running'인 기록만 고칠 수 있고, 끝난 기록(ok, format_error, api_error, save_error)은 고칠 수 없다.
-- 끝난 기록의 status를 바꿔 하루 제한을 피하는 것과, 실패 원인 분석에 쓸 기록을 나중에 고치는 것을 막는다.
create function public.lock_finished_analysis_runs() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'running' then
    raise exception '끝난 분석 기록은 고칠 수 없습니다.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger analysis_runs_lock
  before update on public.analysis_runs
  for each row execute function public.lock_finished_analysis_runs();

commit;

-- ───────────── 실행 뒤 확인 (따로 실행) ─────────────
-- 1) 트리거 2개(analysis_runs_limit, analysis_runs_lock)가 있는지
--    select tgname from pg_trigger where tgrelid = 'public.analysis_runs'::regclass and not tgisinternal order by tgname;
-- 2) 오늘 기록과, 횟수로 세는지 여부
--    select created_at, status, (status <> 'api_error') as counted from public.analysis_runs
--    where (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date order by created_at;
