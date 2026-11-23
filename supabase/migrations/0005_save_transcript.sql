-- Opidence 6단계-1: 전사본과 발언을 한 트랜잭션으로 저장하는 함수
-- Supabase SQL Editor에 전체를 붙여 넣고 한 번 실행한다. 중간에 실패하면 아무것도 바뀌지 않는다.
-- 0001~0004를 먼저 실행한 상태여야 한다. 구조 설명은 docs/db.md에 있다.
--
-- 지금까지는 서버가 전사본을 넣고 발언을 따로 넣었다(요청 2번). 발언 저장이 실패하면 전사본을 지워 되돌렸는데,
-- 그 삭제까지 실패하면 발언 없는 전사본이 남을 수 있었다. 이 함수는 두 저장을 하나로 묶어 둘 다 되거나 둘 다 안 되게 한다.

begin;

-- 호출한 사용자의 권한으로 실행된다(security invoker). 그래서 RLS, 외래 키, 건수 제한(transcripts_limit),
-- 중복 라벨(unique) 검사가 직접 넣을 때와 똑같이 적용되고, 같은 오류 코드(23505, 23514)가 그대로 나온다.
-- owner_id는 두 테이블의 기본값(auth.uid())이 채운다. 함수는 소유자를 받지 않는다.
-- p_utterances: [{"utterance_id": "A-01", "seq": 1, "speaker_role": "moderator", "text": "..."}, ...]
create function public.save_transcript(
  p_label text,
  p_meta text,
  p_char_count integer,
  p_utterances jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- 발언이 없는 전사본은 만들지 않는다.
  if jsonb_typeof(p_utterances) is distinct from 'array' or jsonb_array_length(p_utterances) = 0 then
    raise exception '발언이 없는 전사본은 저장할 수 없습니다.' using errcode = 'check_violation';
  end if;

  insert into public.transcripts (participant_label, meta, char_count)
  values (p_label, p_meta, p_char_count)
  returning id into v_id;

  insert into public.utterances (transcript_id, utterance_id, seq, speaker_role, text)
  select v_id, u ->> 'utterance_id', (u ->> 'seq')::integer, u ->> 'speaker_role', u ->> 'text'
  from jsonb_array_elements(p_utterances) as u;
end;
$$;

-- 로그인하지 않은 요청(anon)은 실행하지 못한다. 로그인한 사용자(익명 로그인 포함)만 실행한다.
revoke all on function public.save_transcript(text, text, integer, jsonb) from public, anon;
grant execute on function public.save_transcript(text, text, integer, jsonb) to authenticated;

commit;

-- ───────────── 실행 뒤 확인 (따로 실행) ─────────────
-- 1) 함수가 있고 호출자 권한(security_definer = false)으로 실행되는지
--    select proname, prosecdef as security_definer, pg_get_function_identity_arguments(oid) as args
--    from pg_proc where pronamespace = 'public'::regnamespace and proname = 'save_transcript';
-- 2) anon은 실행할 수 없고 authenticated만 실행할 수 있는지
--    select has_function_privilege('anon', 'public.save_transcript(text, text, integer, jsonb)', 'execute') as anon,
--           has_function_privilege('authenticated', 'public.save_transcript(text, text, integer, jsonb)', 'execute') as authenticated;
-- 3) 실패하면 전사본이 남지 않는지, 정상 호출은 전사본과 발언이 함께 들어가는지 (아래 전체를 한 번에 실행. 항상 오류로 끝나고 아무것도 저장되지 않는다)
--    begin;
--    select set_config('request.jwt.claims',
--      json_build_object('sub', (select owner_id from public.transcripts order by created_at desc limit 1)::text, 'role', 'authenticated')::text, true);
--    set local role authenticated;
--    do $$
--    declare ok_t int; ok_u int; bad_code text; bad_msg text; bad_left int;
--    begin
--      -- 잘못된 호출: 전사본은 들어가지만 두 번째 발언의 화자가 틀려 발언 저장이 실패한다
--      begin
--        perform public.save_transcript('Z', '확인용', 10,
--          '[{"utterance_id":"Z-01","seq":1,"speaker_role":"participant","text":"가"},{"utterance_id":"Z-02","seq":2,"speaker_role":"nobody","text":"나"}]'::jsonb);
--      exception when others then
--        bad_code := sqlstate; bad_msg := sqlerrm;
--      end;
--      select count(*) into bad_left from public.transcripts where participant_label = 'Z';
--      -- 정상 호출
--      perform public.save_transcript('Y', '확인용', 10,
--        '[{"utterance_id":"Y-01","seq":1,"speaker_role":"participant","text":"가"},{"utterance_id":"Y-02","seq":2,"speaker_role":"moderator","text":"나"}]'::jsonb);
--      select count(*) into ok_t from public.transcripts where participant_label = 'Y';
--      select count(*) into ok_u from public.utterances where utterance_id like 'Y-%';
--      raise exception '확인 결과 | 잘못된 호출: 코드=% 남은 전사본=% 메시지=% | 정상 호출: 전사본=% 발언=%', bad_code, bad_left, bad_msg, ok_t, ok_u;
--    end $$;
--    rollback;
