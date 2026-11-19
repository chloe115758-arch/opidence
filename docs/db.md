# DB 구조

Supabase(Postgres). SQL은 `supabase/migrations/`에 있고, 구조를 바꾸면 이 문서를 함께 고친다.

| 마이그레이션 | 내용 | 적용 |
| --- | --- | --- |
| `0001_init.sql` | 테이블 4개, 건수 제한, 권한, RLS | SQL Editor에서 직접 실행 |
| `0002_vector.sql` (5단계 예정) | pgvector, `utterances.embedding`, `match_utterances` | — |

## 관계

```
auth.users ─┬─< transcripts ──< utterances
            │                      ▲
            └─< insights ──< evidence (verified일 때만 발언 1개를 가리킨다)
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

### insights — 인사이트 (주제 묶음 1개 = 1행)

| 열 | 형식 | 설명 |
| --- | --- | --- |
| `id` | uuid, PK | |
| `owner_id` | uuid → `auth.users` | |
| `title` | text | 묶음 제목. 1~200자 |
| `summary` | text | 요약 |
| `created_at` | timestamptz | |

다시 분석하면 기존 인사이트를 지우고 새로 넣는다.

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

- **인용 문장을 저장하지 않는다.** 화면은 `utterance_pk`로 `utterances.text`를 조인해 보여 주므로 인용이 원문과 달라질 수 없다. (PRD 9번 초안의 "인용 문장, 위치" 열을 뺀 이유)
- **진행자 발언은 근거가 될 수 없다.** `speaker_role`이 `participant`로 고정이고 `(utterance_pk, owner_id, speaker_role)`이 `utterances`를 참조하므로, 진행자 발언·남의 발언·없는 발언을 연결하려 하면 DB가 거부한다. 코드의 대조 함수(`lib/evidence.ts`)에 실수가 있어도 저장 단계에서 막힌다.
- `status = 'verified'`와 `utterance_pk` 유무가 항상 일치한다.
- 탈락한 행(`not_found`, `moderator`)은 4일차 실패 원인 분석에 쓴다.

## RLS와 권한

| 역할 | 누구 | 할 수 있는 것 |
| --- | --- | --- |
| `anon` | 로그인하지 않은 요청 | 없음. 권한도 정책도 없다 |
| `authenticated` | 익명 로그인한 사용자 | 자기 행의 조회·추가·삭제. 수정은 없다 |
| service role | — | 이 프로젝트에서는 쓰지 않는다 |

네 테이블 모두 RLS가 켜져 있고 정책은 테이블마다 하나다.

| 테이블 | 정책 | 조건 | 막는 것 |
| --- | --- | --- | --- |
| `transcripts` | 내 전사본만 | `auth.uid() = owner_id` | 다른 사용자의 전사본 조회·삭제, 남의 이름으로 추가 |
| `utterances` | 내 발언만 | 같음 | 다른 사용자의 발언 원문 조회·삭제, 남의 이름으로 추가 |
| `insights` | 내 인사이트만 | 같음 | 다른 사용자의 인사이트 조회·삭제, 남의 이름으로 추가 |
| `evidence` | 내 근거만 | 같음 | 다른 사용자의 근거 조회·삭제, 남의 이름으로 추가 |

- 서버 코드도 사용자 세션으로 접근하므로 같은 정책을 따른다.
- 공개 키(publishable)는 브라우저에 노출되지만, 이 키로 API를 직접 호출해도 위 정책과 제약(건수 제한, 글자 수 제한, 진행자 근거 금지)을 넘지 못한다.
- SQL Editor는 관리자 권한이라 RLS가 적용되지 않는다. 차단 확인은 앱에서 한다(시크릿 창에서 빈 작업 공간이 보이는지).

## 실행 뒤 확인

`0001_init.sql` 맨 아래 주석의 쿼리 3개를 SQL Editor에서 실행한다.

1. 네 테이블 모두 `rowsecurity = true`
2. 정책 4개가 `{authenticated}`에만 걸려 있음
3. `anon` 행이 없고, `authenticated`는 테이블마다 `SELECT`·`INSERT`·`DELETE` 3개
