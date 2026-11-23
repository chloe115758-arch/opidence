# DB 구조

Supabase(Postgres). SQL은 `supabase/migrations/`에 있고, 구조를 바꾸면 이 문서를 함께 고친다.

| 마이그레이션 | 내용 | 적용 |
| --- | --- | --- |
| `0001_init.sql` | 테이블 4개, 건수 제한, 권한, RLS | SQL Editor에서 직접 실행 |
| `0002_analysis.sql` | 분석 기록 테이블, 하루 10회 제한, 표시 순서 열, 인사이트를 한 번에 교체하는 함수 | SQL Editor에서 직접 실행 |
| `0003_analysis_limit.sql` | 하루 횟수에서 `api_error`를 빼고, 끝난 분석 기록을 고칠 수 없게 잠금 | SQL Editor에서 직접 실행 |
| `0004_search.sql` | pgvector 확장, 발언 임베딩 표, 비슷한 발언 찾기 함수, 검색 기록 표와 하루 30회 제한 | SQL Editor에서 직접 실행 (2026-11-23 실행, 확인 쿼리 통과) |
| `0005_save_transcript.sql` | 전사본과 발언을 한 트랜잭션으로 저장하는 함수 | SQL Editor에서 직접 실행 (실행 전) |

## 관계

```
auth.users ─┬─< transcripts ──< utterances
            │                      ▲
            ├─< insights ──< evidence (verified일 때만 발언 1개를 가리킨다)
            ├─< analysis_runs (분석 한 번 = 1행. 다시 분석해도 지워지지 않는다)
            └─< search_runs (검색 한 번 = 1행)
utterances ──< utterance_embeddings (참가자 발언만. 발언 1개 = 임베딩 1개)
```

모든 테이블에 `owner_id`가 있고, 기본값은 요청한 사용자(`auth.uid()`)다. 사용자는 Supabase 익명 로그인으로 브라우저마다 하나씩 생긴다.

## 테이블

### transcripts — 전사본 (인터뷰 파일 1개 = 1행)

| 열 | 형식 | 설명 |
| --- | --- | --- |
| `id` | uuid, PK | |
| `owner_id` | uuid → `auth.users` | 올린 사용자. 사용자가 지워지면 함께 지워진다 |
| `participant_label` | text | 참가자 라벨. 대문자 한 글자(`A`) |
| `meta` | text | 파일 2행의 헤더(`참가자 A \| 20대 후반 \| …`) |
| `char_count` | integer | 파일 글자 수. 1~10,000 |
| `created_at` | timestamptz | |

- `unique (owner_id, participant_label)`: 같은 참가자 라벨을 두 번 올릴 수 없다.
- 트리거 `transcripts_limit`: 사용자당 10건까지(샘플 8건 + 시연용 2건).

### utterances — 발언 (전사본의 한 줄 = 1행)

| 열 | 형식 | 설명 |
| --- | --- | --- |
| `id` | uuid, PK | |
| `owner_id` | uuid | |
| `transcript_id` | uuid → `transcripts` | 전사본을 지우면 함께 지워진다 |
| `utterance_id` | text | 발언 ID. `A-04` 형식 |
| `seq` | integer | 전사본 안에서 몇 번째 발언인지 |
| `speaker_role` | text | `participant`(참가자) 또는 `moderator`(진행자) |
| `text` | text | 원문 문장. 앞뒤 공백만 제거하고 그대로 저장한다 |

- `unique (owner_id, utterance_id)`: 한 사용자 안에서 발언 ID는 하나뿐이다. 근거 대조는 이 키로 조회한다.
- `unique (transcript_id, seq)`: 순번이 겹치지 않는다.
- 수정 권한이 없어 저장된 원문은 바뀌지 않는다.

### insights — 인사이트 (묶음 1개 = 1행)

| 열 | 형식 | 설명 |
| --- | --- | --- |
| `id` | uuid, PK | |
| `owner_id` | uuid → `auth.users` | |
| `title` | text | 묶음 제목. 1~200자 |
| `summary` | text | 요약 |
| `position` | integer | AI가 돌려준 순서. 화면은 이 순서로 보여 준다 |
| `created_at` | timestamptz | |

다시 분석하면 기존 인사이트를 지우고 새로 넣는다. 삭제와 저장은 함수 `replace_insights`가 한 트랜잭션으로 한다.

### evidence — 근거 (AI가 돌려준 발언 ID 1개 = 1행)

| 열 | 형식 | 설명 |
| --- | --- | --- |
| `id` | uuid, PK | |
| `owner_id` | uuid | |
| `insight_id` | uuid → `insights` | 인사이트를 지우면 함께 지워진다 |
| `returned_id` | text | AI가 준 문자열 그대로. 탈락한 ID도 남긴다 |
| `utterance_pk` | uuid → `utterances`, null 가능 | `verified`일 때만 채운다 |
| `speaker_role` | text | 항상 `participant` |
| `status` | text | `verified`, `not_found`(없는 ID), `moderator`(진행자 발언) |
| `position` | integer | 묶음 안에서 AI가 돌려준 순서 |

- **인용 문장을 저장하지 않는다.** 화면은 `utterance_pk`로 `utterances.text`를 조인해 보여 주므로 인용이 원문과 달라질 수 없다. (PRD 9번 초안의 "인용 문장, 위치" 열을 뺀 이유)
- **진행자 발언은 근거가 될 수 없다.** `speaker_role`이 `participant`로 고정이고 `(utterance_pk, owner_id, speaker_role)`이 `utterances`를 참조하므로, 진행자 발언·남의 발언·없는 발언을 연결하려 하면 DB가 거부한다. 코드의 대조 함수(`lib/evidence.ts`)에 실수가 있어도 저장 단계에서 막힌다.
- `status = 'verified'`와 `utterance_pk` 유무가 항상 일치한다.
- 탈락한 행(`not_found`, `moderator`)은 화면의 "근거 없음" 카드에 쓴다. 다시 분석하면 지워지므로, 기록으로 남길 탈락 목록은 `analysis_runs.dropped`에 따로 저장한다.

### analysis_runs — 분석 기록 ("분석하기" 한 번 = 1행)

OpenAI를 호출하기 직전에 `running`으로 넣고, 끝나면 결과를 채운다. 인사이트와 달리 다시 분석해도 남는다. 4일차 실패 원인 분석, 근거 일치율, 비용 실측은 이 표에서 본다.

| 열 | 형식 | 설명 |
| --- | --- | --- |
| `id` | uuid, PK | |
| `owner_id` | uuid → `auth.users` | |
| `created_at` | timestamptz | 넣는 순간의 시각으로 DB가 덮어쓴다 |
| `status` | text | `running`(호출 중이거나 도중에 끊김), `ok`(저장함), `format_error`(응답 형식이 틀려 저장 안 함), `api_error`(OpenAI 호출 실패), `save_error`(DB 저장 실패) |
| `prompt_version` | text | `prompts/묶음.md`의 버전. 예: `v1` |
| `model` | text | 환경 변수 `OPENAI_MODEL`의 값 |
| `input_tokens`, `output_tokens` | integer | OpenAI가 알려 준 실제 토큰 수 |
| `duration_ms` | integer | 걸린 시간 |
| `cluster_count` | integer | 저장한 묶음 수 |
| `id_total` | integer | AI가 돌려준 발언 ID 수 |
| `id_verified` | integer | 참가자 발언과 일치한 수 |
| `id_not_found` | integer | 원문에 없는 ID 수 |
| `id_moderator` | integer | 진행자 발언 ID 수 |
| `dropped` | jsonb | 탈락한 ID 목록. `[{"id":"Z-99","reason":"not_found","cluster":"묶음 제목"}]` |

- **근거 일치율** = `id_verified / id_total`.
- 탈락 이유는 `not_found`(원문에 없는 ID)와 `moderator`(진행자 발언) 두 가지다. "다른 전사본의 ID"라는 이유는 생기지 않는다: 분석은 사용자의 전사본 전체를 한 번에 보내고 발언 ID는 사용자 안에서 겹치지 않으므로, 어느 전사본의 ID든 참가자 발언이면 유효하다. 다른 사용자의 전사본 ID는 보이지 않아 `not_found`가 된다.
- 트리거 `analysis_runs_limit`: 사용자당 하루 10회(한국 시간 자정 기준). 세는 기준은 "OpenAI 응답이 왔는가"다.
  - 센다: `ok`, `format_error`, `save_error`(응답이 와서 비용이 들었다), `running`(호출 중이거나 도중에 끊김)
  - 세지 않는다: `api_error`(모델 이름 오류, 형식 거부, 크레딧 부족처럼 OpenAI가 요청을 거부해 응답이 없었다). 기록은 남는다.
- 트리거 `analysis_runs_lock`: `running`인 기록만 고칠 수 있다. 끝난 기록은 고칠 수 없어, `status`를 `api_error`로 바꿔 횟수를 되돌릴 수 없다.
- 삭제 권한이 없고, 수정은 결과 열만 할 수 있다. 기록을 지우거나 날짜를 옮겨 하루 제한을 피할 수 없다.
- 남는 틈: 분석이 진행 중(`running`)인 몇 초 사이에 본인 세션으로 API를 직접 호출해 그 기록을 `api_error`로 바꾸면 1회를 되돌릴 수 있다. 서버도 사용자 세션으로 접근하므로(service role 키를 쓰지 않는다) DB가 둘을 구분하지 못한다. 전체 지출 상한은 선불 크레딧이 맡는다.

조회 예:

```sql
-- 분석별 근거 일치율과 비용 실측
select created_at, status, prompt_version, model, cluster_count,
       id_verified, id_total, round(100.0 * id_verified / nullif(id_total, 0), 1) as match_pct,
       input_tokens, output_tokens, duration_ms
from analysis_runs order by created_at desc;

-- 탈락한 ID와 이유
select r.created_at, d ->> 'id' as id, d ->> 'reason' as reason, d ->> 'cluster' as cluster
from analysis_runs r, jsonb_array_elements(r.dropped) d order by r.created_at desc;
```

SQL Editor는 관리자 권한이라 모든 사용자의 기록이 함께 나온다.

### utterance_embeddings — 발언 임베딩 (참가자 발언 1개 = 1행)

"검색 · 찾기"가 처음 실행될 때 서버가 임베딩이 없는 참가자 발언만 만들어 넣는다. `utterances`에 update 권한이 없어(원문이 바뀌지 않는다는 보장) `utterances.embedding` 열 대신 별도 표로 둔다(2026-11-21 결정).

| 열 | 형식 | 설명 |
| --- | --- | --- |
| `utterance_pk` | uuid, PK → `utterances` | 발언을 지우면(전사본을 지우면) 함께 지워진다 |
| `owner_id` | uuid | |
| `speaker_role` | text | 항상 `participant` |
| `model` | text | 만들 때의 `OPENAI_EMBEDDING_MODEL` 값 |
| `embedding` | vector(1536) | `text-embedding-3-small` 기준. 차원이 다른 모델로 바꾸면 이 열과 `match_utterances`의 1536을 고치고 다시 만든다 |
| `created_at` | timestamptz | |

- `(utterance_pk, owner_id, speaker_role)`가 `utterances`를 참조하므로 진행자 발언·남의 발언·없는 발언의 임베딩은 DB가 거부한다(`evidence`와 같은 방식). 진행자 발언은 검색되지 않는다.
- 조회·추가·삭제만 열려 있다. 모델을 바꾸면 지우고 다시 만든다. `match_utterances`는 지금 모델로 만든 것만 찾는다.

### search_runs — 검색 기록 ("찾기" 한 번 = 1행)

AI를 부르기 직전에 `running`으로 넣고, 끝나면 결과를 채운다. **질문과 답변 문장은 저장하지 않는다.** 횟수·토큰·시간·발언 번호와 점수만 남긴다.

| 열 | 형식 | 설명 |
| --- | --- | --- |
| `id`, `owner_id`, `created_at` | | `created_at`은 넣는 순간의 시각으로 DB가 덮어쓴다 |
| `status` | text | `running`, `ok`(끝남. "찾지 못했습니다"도 정상), `format_error`(답변 형식이 틀려 쓰지 않음), `api_error`(OpenAI 호출 실패, 임베딩 또는 답변) |
| `prompt_version` | text | `prompts/근거.md`의 버전 |
| `model`, `embedding_model` | text | `OPENAI_MODEL`, `OPENAI_EMBEDDING_MODEL`의 값 |
| `embed_tokens` | integer | 질문 임베딩 + 이번에 새로 만든 발언 임베딩의 토큰 수 |
| `input_tokens`, `output_tokens` | integer | 답변 생성의 실제 토큰 수 |
| `duration_ms` | integer | 걸린 시간 |
| `indexed_count` | integer | 이번 검색에서 새로 임베딩한 발언 수. 첫 검색이면 0보다 크다 |
| `retrieved_count` | integer | 가져온 발언 수(기본 20) |
| `hits` | jsonb | 가져온 발언의 번호와 유사도, 가까운 순. `[{"id":"A-04","score":0.4312}]`. 문장은 없다 |
| `sentence_count` | integer | AI가 쓴 요약 문장 수 |
| `id_total`, `id_verified`, `id_not_found`, `id_moderator` | integer | 주제 분류의 `analysis_runs`와 같은 뜻 |
| `cited_ids` | text[] | 요약이 인용한, 원문 대조를 통과한 발언 번호 |
| `dropped` | jsonb | 탈락한 번호와 이유. `[{"id":"Z-99","reason":"not_found"}]` |

- `hits`와 `cited_ids`는 4일차에 "정답을 아는 질문"으로 유사도 기준선을 정할 때 쓴다. **기준선은 아직 정하지 않았고, 기록만 남긴다.**
- 트리거 `search_runs_limit`: 사용자당 하루 30회(한국 시간 자정 기준). `api_error`는 세지 않는다. 이유와 한계는 `analysis_runs`와 같다.
- 트리거 `search_runs_lock`: `running`인 기록만 고칠 수 있다. 삭제 권한이 없고 수정은 결과 열 15개뿐이다.

조회 예:

```sql
-- 검색별 시간·토큰·근거 일치율. indexed_count > 0인 행이 첫 검색(색인 포함)이다
select created_at, status, indexed_count, retrieved_count, sentence_count,
       id_verified, id_total, embed_tokens, input_tokens, output_tokens, round(duration_ms / 1000.0, 1) as sec
from search_runs order by created_at desc;

-- 가져온 발언 중 요약이 실제로 인용한 것과 점수 (유사도 기준선을 정할 때)
select r.created_at, h ->> 'id' as id, (h ->> 'score')::numeric as score, (h ->> 'id') = any(r.cited_ids) as cited
from search_runs r, jsonb_array_elements(r.hits) h
where r.status = 'ok' order by r.created_at desc, score desc;
```

## 함수

### save_transcript(p_label, p_meta, p_char_count, p_utterances)

전사본 1행과 발언 여러 행을 한 트랜잭션으로 저장한다. 발언 저장이 실패하면 전사본도 들어가지 않는다(예전에는 요청 두 번이라 실패하면 전사본을 지워 되돌렸고, 그 삭제가 실패하면 발언 없는 전사본이 남을 수 있었다). `p_utterances`는 `[{"utterance_id","seq","speaker_role","text"}, …]` 배열이고, 비어 있으면 거부한다. 호출한 사용자의 권한으로 실행되어(`security invoker`) RLS, 외래 키, 10건 제한(`transcripts_limit`), 같은 라벨 중복 검사가 직접 넣을 때와 똑같이 적용되고 같은 오류 코드(`23505`, `23514`)가 나온다. `owner_id`는 받지 않는다: 두 표의 기본값(`auth.uid()`)이 채운다. `authenticated`만 실행할 수 있고 `anon`은 실행할 수 없다.

### match_utterances(query_embedding, p_model, match_count)

질문 벡터와 가까운 참가자 발언을 가까운 순으로 `(utterance_pk, similarity)`만 돌려준다(코사인 유사도). 문장은 돌려주지 않고, 화면은 번호로 원문을 따로 읽는다. 기본 20개, 최대 30개. 호출한 사용자의 권한으로 실행되어(RLS 적용) 내 발언만 찾는다. 벡터 색인(HNSW)은 없다: 발언이 수천 개를 넘으면 만든다.

### replace_insights(p_clusters jsonb)

기존 인사이트·근거 삭제와 새 저장을 한 트랜잭션으로 한다. 저장이 중간에 실패하면 전부 되돌아가 기존 인사이트가 남는다. 호출한 사용자의 권한으로 실행되어 RLS와 외래 키가 그대로 적용된다. `authenticated`만 실행할 수 있다.

## RLS와 권한

| 역할 | 누구 | 할 수 있는 것 |
| --- | --- | --- |
| `anon` | 로그인하지 않은 요청 | 없음. 권한도 정책도 없다 |
| `authenticated` | 익명 로그인한 사용자 | 자기 행의 조회·추가·삭제. 수정은 없다. `analysis_runs`·`search_runs`만 예외: 조회·추가와 결과 열 수정, 삭제 없음 |
| service role | — | 이 프로젝트에서는 쓰지 않는다 |

일곱 테이블 모두 RLS가 켜져 있고 정책은 테이블마다 하나다.

| 테이블 | 정책 | 조건 | 막는 것 |
| --- | --- | --- | --- |
| `transcripts` | 내 전사본만 | `auth.uid() = owner_id` | 다른 사용자의 전사본 조회·삭제, 남의 이름으로 추가 |
| `utterances` | 내 발언만 | 같음 | 다른 사용자의 발언 원문 조회·삭제, 남의 이름으로 추가 |
| `insights` | 내 인사이트만 | 같음 | 다른 사용자의 인사이트 조회·삭제, 남의 이름으로 추가 |
| `evidence` | 내 근거만 | 같음 | 다른 사용자의 근거 조회·삭제, 남의 이름으로 추가 |
| `analysis_runs` | 내 분석 기록만 | 같음 | 다른 사용자의 분석 기록 조회·수정, 남의 이름으로 추가 |
| `utterance_embeddings` | 내 임베딩만 | 같음 | 다른 사용자의 임베딩 조회·삭제, 남의 이름으로 추가 |
| `search_runs` | 내 검색 기록만 | 같음 | 다른 사용자의 검색 기록 조회·수정, 남의 이름으로 추가 |

- 서버 코드도 사용자 세션으로 접근하므로 같은 정책을 따른다.
- 공개 키(publishable)는 브라우저에 노출되지만, 이 키로 API를 직접 호출해도 위 정책과 제약(건수 제한, 글자 수 제한, 진행자 근거 금지)을 넘지 못한다.
- SQL Editor는 관리자 권한이라 RLS가 적용되지 않는다. 차단 확인은 앱에서 한다(시크릿 창에서 빈 작업 공간이 보이는지).

## 실행 뒤 확인

각 마이그레이션 파일 맨 아래 주석의 확인 쿼리를 SQL Editor에서 실행한다. 아래는 `0001_init.sql`의 것이다.

1. 네 테이블 모두 `rowsecurity = true`
2. 정책 4개가 `{authenticated}`에만 걸려 있음
3. `anon` 행이 없고, `authenticated`는 테이블마다 `SELECT`·`INSERT`·`DELETE` 3개

`0002_analysis.sql`:

1. `analysis_runs`의 `rowsecurity = true`
2. `anon` 행이 없고, `authenticated`는 `SELECT`·`INSERT`·`UPDATE` 3개(`DELETE` 없음)
3. 수정할 수 있는 열이 결과 열 10개뿐(`owner_id`, `created_at` 없음)

`0003_analysis_limit.sql`:

1. 트리거가 `analysis_runs_limit`, `analysis_runs_lock` 2개
2. 오늘 기록에서 `api_error`인 행의 `counted`가 `false`

`0004_search.sql`:

1. `vector` 확장이 켜져 있음
2. `utterance_embeddings`, `search_runs`의 `rowsecurity = true`
3. `anon` 행이 없고, `authenticated`는 `utterance_embeddings`가 `SELECT`·`INSERT`·`DELETE`, `search_runs`가 `SELECT`·`INSERT`·`UPDATE`
4. `search_runs`의 수정 가능한 열이 결과 열 15개뿐(`owner_id`, `created_at`, `prompt_version`, `model` 없음)
5. 트리거 `search_runs_limit`, `search_runs_lock`과 함수 `match_utterances`가 있음

`0005_save_transcript.sql`:

1. 함수 `save_transcript`가 있고 `security_definer = false`
2. 실행 권한: `anon` = false, `authenticated` = true
3. 파일 맨 아래의 종합 확인(항상 오류로 끝나고 아무것도 저장하지 않는다)이 "잘못된 호출: 코드=23514 남은 전사본=0", "정상 호출: 전사본=1 발언=2"를 돌려줌
