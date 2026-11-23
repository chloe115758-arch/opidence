-- 4일차 측정용 조회문. Supabase SQL Editor에서 한 개씩 실행한다. 읽기만 하고 아무것도 바꾸지 않는다.
-- SQL Editor는 관리자 권한이라 모든 사용자의 기록이 섞여 나온다. 아래 조회문은 "가장 최근에 끝난 분석"의 사용자만 본다.
-- 가짜 응답(MOCK_AI=1)으로 만든 기록은 model = 'mock'이라서 모두 뺀다.
--
-- 중요: evidence(묶음별 발언 번호)는 "다시 분석하기"를 누를 때마다 지워지고 마지막 1회분만 남는다(replace_insights).
--       evidence에는 어느 분석 회차인지 적는 열도 없다. 그래서 3회를 비교하려면
--       분석이 끝날 때마다 [1]번을 실행해 결과를 바로 저장(복사)해 둔다. [2]번은 회차가 모두 남아 있어 나중에 한 번에 돌려도 된다.


-- [1] 묶음별로 AI가 붙인 발언 번호 목록 (지금 화면에 있는 분석 = 가장 최근 ok 분석)
--     "분석 1회가 끝난 직후"에 실행한다. run_id와 시각은 [2]번의 회차와 맞춰 보는 용도다.
--     ai가_붙인_발언_번호: AI가 준 순서 그대로. 정답 라벨과 이 열을 직접 대조한다.
--     탈락_번호: 그중 원문에 없거나 진행자 발언이라 근거로 인정되지 않은 것.
with last_run as (
  select id, owner_id, created_at, prompt_version, model
  from analysis_runs
  where status = 'ok' and model <> 'mock'
  order by created_at desc
  limit 1
)
select l.id as run_id,
       l.created_at as 분석_시각,
       l.prompt_version,
       i.position as 묶음_순서,
       i.title as 묶음_제목,
       count(e.id) as 받은_번호_수,
       count(*) filter (where e.status = 'verified') as 일치,
       string_agg(e.returned_id, ', ' order by e.position) as ai가_붙인_발언_번호,
       string_agg(e.returned_id, ', ' order by e.position) filter (where e.status <> 'verified') as 탈락_번호
from last_run l
join insights i on i.owner_id = l.owner_id
left join evidence e on e.insight_id = i.id
group by l.id, l.created_at, l.prompt_version, i.id, i.position, i.title
order by i.position;


-- [1-b] 같은 분석의 근거를 한 줄씩, 원문 문장과 함께 (정답 라벨과 문장을 눈으로 대조할 때)
--       탈락한 번호는 원문 문장이 비어 있다(원문에 없거나 진행자 발언이라 연결하지 않았다).
with last_run as (
  select owner_id
  from analysis_runs
  where status = 'ok' and model <> 'mock'
  order by created_at desc
  limit 1
)
select i.position as 묶음_순서,
       i.title as 묶음_제목,
       e.position as 묶음_안_순서,
       e.returned_id as 발언_번호,
       e.status as 상태,
       u.text as 원문_문장
from last_run l
join insights i on i.owner_id = l.owner_id
join evidence e on e.insight_id = i.id
left join utterances u on u.id = e.utterance_pk
order by i.position, e.position;


-- [2] 분석 회차별 탈락 기록 요약 (최근 끝난 분석 10건, 오래된 것부터)
--     형식 일치율 = 일치 / 받은 번호 수. 번호가 원문의 참가자 발언으로 실제 존재하는지만 본다.
--     그 발언이 묶음 주제를 뒷받침하는지(의미 일치)는 코드가 알 수 없으니 [1]번 결과를 정답 라벨과 사람이 대조한다.
select row_number() over (order by created_at) as 회차,
       created_at as 분석_시각,
       prompt_version,
       model,
       cluster_count as 묶음_수,
       id_total as 받은_번호_수,
       id_verified as 일치,
       id_not_found as 원문에_없음,
       id_moderator as 진행자_발언,
       round(100.0 * id_verified / nullif(id_total, 0), 1) as 형식_일치율_pct,
       round(duration_ms / 1000.0, 1) as 걸린_초,
       input_tokens,
       output_tokens
from (
  select *
  from analysis_runs
  where status = 'ok' and model <> 'mock'
    and owner_id = (select owner_id from analysis_runs where status = 'ok' and model <> 'mock' order by created_at desc limit 1)
  order by created_at desc
  limit 10
) recent
order by created_at;


-- [2-b] 탈락한 번호 목록 (회차별. 어느 묶음에서 왜 탈락했는지)
select r.created_at as 분석_시각,
       d ->> 'cluster' as 묶음_제목,
       d ->> 'id' as 받은_번호,
       case d ->> 'reason' when 'not_found' then '원문에 없음' when 'moderator' then '진행자 발언' else d ->> 'reason' end as 탈락_이유
from analysis_runs r
cross join lateral jsonb_array_elements(r.dropped) d
where r.status = 'ok' and r.model <> 'mock'
  and r.owner_id = (select owner_id from analysis_runs where status = 'ok' and model <> 'mock' order by created_at desc limit 1)
order by r.created_at, d ->> 'cluster', d ->> 'id';


-- [3] 끝나지 못한 분석도 함께 보기 (형식 오류, 호출 실패 등. 측정에서 뺀 이유를 적을 때)
select created_at, status, prompt_version, model, duration_ms
from analysis_runs
where model <> 'mock' and status <> 'ok'
order by created_at desc
limit 20;


-- ═══════════════════════════ 검색 · 찾기 (5단계) ═══════════════════════════
-- 검색 기록(search_runs)에는 질문과 답변 문장이 없다. 그래서 질문과 기록을 맞추려면
-- 검색할 때마다 "검색 시각 + 질문 + 정답 발언 번호"를 직접 적어 두고, 아래 결과의 시각과 대조한다.
-- 가짜 응답(MOCK_AI=1)으로 만든 기록은 model = 'mock'이라서 모두 뺀다. 아래 조회문은 "가장 최근에 끝난 검색"의 사용자만 본다.
-- 유사도 기준선은 아직 정하지 않았다. [5]·[6]은 4일차에 "정답을 아는 질문 10개"로 기준선을 정할 때 쓴다.

-- [4] 검색 회차별 요약 (최근 끝난 검색 30건, 오래된 것부터)
--     첫 검색(색인 포함)은 새로_만든_발언 > 0인 행이다. 시간과 토큰이 평소보다 크다.
--     형식 일치율 = 일치 / 받은 번호 수. 번호가 원문의 참가자 발언으로 존재하는지만 본다(뜻이 맞는지는 사람이 본다).
select row_number() over (order by created_at) as 회차,
       created_at as 검색_시각,
       prompt_version,
       indexed_count as 새로_만든_발언,
       retrieved_count as 가져온_발언,
       sentence_count as 요약_문장,
       id_total as 받은_번호_수,
       id_verified as 일치,
       id_not_found as 원문에_없음,
       id_moderator as 진행자_발언,
       round(100.0 * id_verified / nullif(id_total, 0), 1) as 형식_일치율_pct,
       round(duration_ms / 1000.0, 1) as 걸린_초,
       embed_tokens,
       input_tokens,
       output_tokens
from (
  select *
  from search_runs
  where status = 'ok' and model <> 'mock'
    and owner_id = (select owner_id from search_runs where status = 'ok' and model <> 'mock' order by created_at desc limit 1)
  order by created_at desc
  limit 30
) recent
order by created_at;


-- [5] 검색별 가져온 발언의 순위·유사도와, 요약이 실제로 인용했는지 (유사도 기준선을 정할 때)
--     순위 1이 질문과 가장 가까운 발언이다. 인용됨 = 요약이 쓴 번호이고 원문 대조를 통과한 것.
--     정답_발언_번호를 적어 둔 질문이라면 이 표에서 정답이 몇 위·몇 점이었는지 본다.
select r.created_at as 검색_시각,
       h.ord as 순위,
       h.item ->> 'id' as 발언_번호,
       (h.item ->> 'score')::numeric as 유사도,
       (h.item ->> 'id') = any(r.cited_ids) as 인용됨
from search_runs r
cross join lateral jsonb_array_elements(r.hits) with ordinality as h(item, ord)
where r.status = 'ok' and r.model <> 'mock'
  and r.owner_id = (select owner_id from search_runs where status = 'ok' and model <> 'mock' order by created_at desc limit 1)
order by r.created_at, h.ord;


-- [6] 검색별 유사도 범위: 인용된 발언의 최저 점수 vs 인용되지 않은 발언의 최고 점수
--     인용된_최저가 인용_안된_최고보다 높게 벌어지면 그 사이에서 기준선을 잡을 수 있다. 겹치면 기준선 하나로 가를 수 없다.
select r.created_at as 검색_시각,
       max((h.item ->> 'score')::numeric) filter (where (h.item ->> 'id') = any(r.cited_ids)) as 인용된_최고,
       min((h.item ->> 'score')::numeric) filter (where (h.item ->> 'id') = any(r.cited_ids)) as 인용된_최저,
       max((h.item ->> 'score')::numeric) filter (where not (h.item ->> 'id') = any(r.cited_ids)) as 인용_안된_최고,
       count(*) filter (where (h.item ->> 'id') = any(r.cited_ids)) as 인용된_수,
       count(*) as 가져온_수
from search_runs r
cross join lateral jsonb_array_elements(r.hits) as h(item)
where r.status = 'ok' and r.model <> 'mock'
  and r.owner_id = (select owner_id from search_runs where status = 'ok' and model <> 'mock' order by created_at desc limit 1)
group by r.id, r.created_at
order by r.created_at;


-- [7] 탈락한 번호 목록 (어떤 검색에서 어떤 번호가 왜 탈락했는지)
select r.created_at as 검색_시각,
       d ->> 'id' as 받은_번호,
       case d ->> 'reason' when 'not_found' then '원문에 없음' when 'moderator' then '진행자 발언' else d ->> 'reason' end as 탈락_이유
from search_runs r
cross join lateral jsonb_array_elements(r.dropped) d
where r.status = 'ok' and r.model <> 'mock'
  and r.owner_id = (select owner_id from search_runs where status = 'ok' and model <> 'mock' order by created_at desc limit 1)
order by r.created_at, d ->> 'id';


-- [8] 끝나지 못한 검색도 함께 보기 (형식 오류, 호출 실패, 도중에 끊긴 running)
select created_at, status, prompt_version, model, embedding_model, indexed_count, duration_ms
from search_runs
where model <> 'mock' and status <> 'ok'
order by created_at desc
limit 20;
