# Opidence 작업 계획

2026-11-19 승인. 요구사항은 `docs/PRD.md`, 규칙은 `CLAUDE.md`를 따른다.
PRD 6번의 "뺀다" 항목(음성 변환, 다국어, 드래그 보드, 다른 리서치 데이터, 팀 협업)은 만들지 않는다.

## 확정된 결정

| 항목 | 결정 |
| --- | --- |
| 스택 | Next.js(App Router) + Supabase + LangChain.js + OpenAI + Vercel. 11/25 멘토 확인에서 바뀌면 조정 |
| 사용자 구분 | Supabase 익명 로그인. 빈 작업 공간에 "샘플 인터뷰 8건 불러오기" 버튼 |
| 모델 | `OPENAI_MODEL`, `OPENAI_EMBEDDING_MODEL` 환경 변수. 코드에 모델 이름을 쓰지 않는다 |
| 예산 | 선불 크레딧 소액 + 자동 충전 끔 (사용자가 관리) |
| 제한 | 파일당 10,000자, 사용자당 전사본 10건, 질문 200자 |
| 개인정보 감지 | 전화번호·이메일·주민번호 형태, 화자 라벨 오류. 감지하면 업로드 중단. 실명은 감지하지 못하므로 업로드 화면에 "본문의 이름은 직접 확인해 주세요" 안내 |
| 오류 문구 | 고치는 방법까지 알려 준다. 예: "화자는 '진행자' 또는 '참가자 A'처럼 써 주세요" |
| 근거 없는 답변 문장 | 기본으로 숨기고, 답변 아래 "근거 없는 문장 n개 보기"를 펼치면 "근거 없음" 라벨과 함께 보여 준다 |
| 디자인 | 시안 없음. Tailwind 기본, 강조색 1개(`app/globals.css`의 `--color-accent`), 회색 계열, 넉넉한 여백 |
| 근거 표시 대안 | A안(답변 아래 인용 모음), B안(문장 옆 번호 + 옆 패널). `/ask?view=a|b` |
| 질문·답변 기록 | 저장하지 않는다 |
| 설계의도 파일 | 레포에 넣지 않는다. 프롬프트를 그 내용에 맞춰 고치지 않는다 |

## 단계

각 단계가 끝나면 실행 방법과 브라우저 확인 방법을 알려 주고, 승인 뒤 다음 단계로 간다.

### 1단계 — 화면 뼈대 (가짜 데이터)

- 파일: `app/layout.tsx`, `app/page.tsx`(업로드·목록), `app/insights/page.tsx`(주제 묶음), `app/transcripts/[label]/page.tsx`(근거 보기), `app/ask/page.tsx`(질문·답변 A안·B안), `app/loading.tsx`, `components/Nav.tsx`, `components/Quote.tsx`, `lib/types.ts`, `lib/evidence.ts`(+테스트), `lib/mock.ts`
- 가짜 데이터는 실제 인터뷰와 **다른 주제**(도서관 좌석 예약 앱, 참가자 X·Y)로 만든다. 실제 8건의 묶음 예시를 미리 보면 1일차 기준선 측정이 흐려지기 때문이다.
- 확인: `npm run dev` → `localhost:3000`. 네 화면 이동, 인용 카드 클릭 한 번으로 원문 발언 강조, "근거 없음" 카드, `/ask`의 A안·B안과 "근거 없는 문장 n개 보기", `/?empty`의 빈 상태와 샘플 버튼.
- 1단계가 끝나면 뼈대를 Vercel에 먼저 올려 둔다(PRD 2일차 체크포인트 대비, 선택).

### 2단계 — Supabase 연결

- 파일: `supabase/migrations/0001_init.sql`, `lib/supabase/server.ts`, `lib/supabase/client.ts`, `proxy.ts`(세션 갱신), `lib/transcript.ts`(+테스트: 파싱·형식 검사·개인정보 검사), `app/actions.ts`(업로드, 삭제, 샘플 불러오기), `docs/db.md`, `.env.example`
- 샘플 불러오기는 `data/interviews/`의 8건을 일반 업로드와 같은 검사·저장 경로로 넣는다.
- 확인: 샘플 버튼 → 목록 8건(A는 발언 16개 중 참가자 8개). Table Editor에 발언 116행(참가자 58행). 시크릿 창에서는 빈 작업 공간. 11번째 업로드는 막힘.

### 3단계 — 주제 묶음

- 파일: `prompts/묶음.md`, `lib/ai/cluster.ts`(서버 전용), `app/insights/actions.ts`, `app/insights/page.tsx`
- AI에는 전체 발언을 ID·화자 표시와 함께 보내고 `{제목, 요약, 발언 ID 목록}`만 구조화 출력으로 받는다.
- 확인: "분석하기" → 묶음 카드 생성, 근거 개수는 "대조 전"으로 표시.

### 4단계 — 원문 대조

- 파일: `lib/evidence.ts`를 DB 조회와 연결, 저장 로직, `lib/ai/fixture.ts`(`MOCK_AI=1`이면 없는 ID·진행자 ID가 섞인 가짜 응답)
- 확인: 인용이 원문 그대로 나오고 클릭하면 원문 위치로 이동. `MOCK_AI=1`에서 없는 ID와 진행자 ID가 "근거 없음"으로 표시.

### 5단계 — 질문·답변 (RAG)

- 파일: `supabase/migrations/0002_vector.sql`(pgvector, 임베딩 열, `match_utterances`), `lib/ai/embed.ts`, `prompts/근거.md`, `lib/ai/answer.ts`, `app/ask/page.tsx`
- 흐름: 참가자 발언만 검색 → 답변 문장별 발언 ID → 4단계 대조 함수 → 근거 없는 문장은 숨김 처리.
- 주의: 벡터 열의 차원은 임베딩 모델에 맞춰 정한다. `OPENAI_EMBEDDING_MODEL`을 차원이 다른 모델로 바꾸면 마이그레이션과 재임베딩이 필요하다.
- 확인: 전사본에 있는 내용을 물으면 답 + 인용, 없는 내용을 물으면 "원문에서 근거를 찾지 못했습니다".

### 6단계 — 상태 화면과 방어

- 파일: 화면별 `loading.tsx`, `app/error.tsx`(다시 시도), 업로드 상태(빈 상태, 업로드 중, 형식 오류, 개인정보 경고), 작은 화면·긴 텍스트, `data/test/`(빈 파일, 제한 초과, 가짜 연락처)
- 확인(PRD 8번): 빈 파일, 제한 초과, 가짜 연락처, 전사본에 없는 질문, 키 누락, 시크릿 창 접근 차단.

### 7단계 — 배포

- 파일: `README.md`(고른 메뉴 표, AI 사용 지도), Vercel 환경 변수, 푸시 전 키·개인정보 점검
- 확인: 배포 주소에서 샘플 불러오기 → 분석 → 근거 보기 → 질문까지 완주. 개발자 도구에서 `sk-` 검색 0건.

## 데이터 구조 초안 (최종은 `docs/db.md`)

```
transcripts  id, owner_id, participant_label, meta, char_count, created_at
             unique(owner_id, participant_label)
utterances   id, owner_id, transcript_id→transcripts, utterance_id('A-04'), seq,
             speaker_role('participant'|'moderator'), text, embedding(5단계)
             unique(owner_id, utterance_id), unique(id, speaker_role)
insights     id, owner_id, title, summary, created_at
evidence     id, owner_id, insight_id→insights, returned_id(AI가 준 문자열),
             utterance_pk(null 가능), speaker_role 고정 'participant',
             status('verified'|'not_found'|'moderator')
             FK (utterance_pk, speaker_role) → utterances(id, speaker_role)
```

- 근거 테이블에 인용 문장을 저장하지 않는다. 화면은 항상 `utterances`를 조인해 원문을 가져온다.
- 복합 FK로 진행자 발언은 DB 수준에서 근거로 연결할 수 없다.
- 탈락한 ID도 `status`와 함께 남겨 4일차 실패 원인 분석에 쓴다.
- RLS: 네 테이블 모두 `owner_id uuid default auth.uid()`, 정책은 `authenticated`에 `owner_id = auth.uid()` 하나. `anon`은 정책이 없어 0행. `match_utterances`는 호출자 권한으로 실행한다.

## 발언 구분과 저장

- 형식: 1행 가상 데이터 표시, 2행 `참가자 X | …` 헤더, 이후 `X-NN 진행자: …` 또는 `X-NN 참가자 X: …`
- 정규식: `^([A-Z])-(\d{2,}) (진행자|참가자 ([A-Z])): (.+)$`. `진행자` → `moderator`, `참가자 X` → `participant`
- 검사: ID 접두어·화자 라벨·헤더 라벨 일치, ID 중복 없음과 순서, 형식에 안 맞는 줄 없음. 어긋나면 추측하지 않고 줄 번호와 고치는 방법을 알려 주며 중단한다.
- 문장은 앞뒤 공백만 제거하고 그대로 저장한다. 여러 줄에 걸친 발언은 형식 오류로 처리한다.

## 근거 규칙

1. AI 출력 스키마에 인용 문장 자리가 없다. `utterance_ids: string[]`만 받는다.
2. 대조 함수는 `lib/evidence.ts` 하나이고 주제 묶음과 질문·답변이 모두 거친다. 정확히 일치하는 ID만 조회한다: 없으면 `not_found`, 진행자면 `moderator`, 참가자면 `verified`. 비슷한 ID를 고쳐 주지 않는다.
3. 화면의 인용은 `verified` 행의 `utterances.text`만 렌더링한다.
4. 검증된 근거가 0개인 인사이트는 "근거 없음" 상태로 표시한다. 질문·답변에서 검증된 문장이 0개면 "원문에서 근거를 찾지 못했습니다"로 답한다.

## 키와 서버 전용 코드

| 값 | 위치 | 브라우저 노출 |
| --- | --- | --- |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_EMBEDDING_MODEL` | `.env.local`, Vercel 환경 변수 | 안 됨 |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 같은 곳 | 됨 (RLS로 보호) |
| Supabase service role 키 | 사용하지 않음 | — |

- 서버 전용: `lib/ai/*`, 모든 `actions.ts`, `lib/supabase/server.ts`. `import 'server-only'`로 클라이언트에서 불러오면 빌드가 실패하게 한다.
- 브라우저: 화면 컴포넌트와 업로드 전 사전 검사(`lib/transcript.ts`). 같은 검사를 서버에서 다시 한다.

## 넣지 않는 것

Playwright QA, 질문·답변 기록 저장, "전해 들은 말·추측" 자동 표시, 정답 라벨 채점 스크립트. 필요해지면 그때 추가한다.
