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
| 디자인 | Montage(원티드 디자인 시스템, MIT) 컴포넌트 `@montage-ui/core`를 쓴다(2026-11-19 변경, Emotion 추가). 버튼·탭·알림·빈 상태·배지·입력은 Montage 컴포넌트, Montage에 없는 인용 카드·원문 발언 줄·패널은 Tailwind에 연결한 Montage 색 값(`app/globals.css`)으로 그린다. 원티드 로고와 `wanted` 로딩 애니메이션은 쓰지 않는다. "근거 없음"은 오류 색이 아니라 중립 색으로 둔다 |
| 근거 표시 대안 | **B안(문장 옆 번호 + 옆 패널)을 기본으로 선택**(2026-11-19). 이유: 문장별 근거를 사용자가 직접 확인할 수 있고, 잘못 붙은 근거가 드러난다. A안(답변 아래 인용 모음)은 사용성 테스트 비교용으로 남긴다(`/ask?view=a`). 사용성 테스트로 최종 확정할 예정이다 |
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

- 파일: `supabase/migrations/0001_init.sql`, `lib/supabase/server.ts`, `proxy.ts`(세션 갱신), `lib/transcript.ts`(+테스트: 파싱·형식 검사·개인정보 검사), `lib/store.ts`(저장·조회), `app/actions.ts`(업로드, 삭제, 샘플 불러오기), `components/Upload.tsx`(업로드 입력, 실행 버튼), `app/error.tsx`(다시 시도 화면), `docs/db.md`, `.env.example`
- 샘플 불러오기는 `data/interviews/`의 8건을 일반 업로드와 같은 검사·저장 경로로 넣는다.
- 확인: 샘플 버튼 → 목록 8건(A는 발언 16개 중 참가자 8개). Table Editor에 발언 114행(참가자 57행). 시크릿 창에서는 빈 작업 공간. 11번째 업로드는 막힘.

### 3단계 — 주제 묶음 + 원문 대조 (2026-11-19 범위 변경)

근거 테이블은 `status` 없이 저장할 수 없어서, 원래 4단계였던 원문 대조와 저장을 3단계에서 함께 한다.

- 파일: `supabase/migrations/0002_analysis.sql`, `supabase/migrations/0003_analysis_limit.sql`, `prompts/묶음.md`, `lib/cluster.ts`(+테스트: 응답 형식 검사, 보낼 글, 프롬프트 버전), `lib/ai/cluster.ts`(서버 전용, OpenAI 호출), `app/insights/actions.ts`, `app/insights/page.tsx`, `components/Analyze.tsx`, `lib/store.ts`, `docs/db.md`
- AI에는 진행자·참가자 발언을 화자와 발언 ID를 붙여 보내고 `{title, summary, utterance_ids}`만 정해진 JSON 형식(최대 8개)으로 받는다. 형식이 틀리면 저장하지 않는다.
- 받은 ID는 `lib/evidence.ts`로 대조한다: 참가자 발언과 정확히 일치하면 `verified`, 없으면 `not_found`, 진행자면 `moderator`. 고쳐 주지 않고 다시 묻지 않는다.
- 다시 분석하면 기존 인사이트·근거를 지우고 새로 만든다(DB 함수 `replace_insights`, 한 트랜잭션).
- 사용자당 하루 10회(한국 시간 자정 기준). OpenAI 응답이 온 분석은 저장에 실패해도 1회로 세고, 요청이 거부돼 응답이 없던 실패(모델 이름 오류, 형식 거부, 크레딧 부족)는 세지 않는다(`0003_analysis_limit.sql`). 화면에 "오늘 남은 분석 n회"를 보여 준다.
- 분석 기록(`analysis_runs`)에 탈락한 ID와 이유, 근거 일치율 재료, 토큰 수, 걸린 시간을 남긴다. 4일차 실패 원인 분석에 쓴다.
- 프롬프트는 `prompts/묶음.md`에 v1부터 쌓는다. 코드는 가장 아래 버전을 쓴다.
- 확인: "분석하기" → 묶음 카드와 인용(DB 원문), 다시 분석하면 교체, 11번째는 막힘, 키가 없으면 안내.

### 4단계 — 탈락 사례 강제 확인

- 파일: `lib/ai/fixture.ts`(`MOCK_AI=1`이면 없는 ID·진행자 ID가 섞인 가짜 응답)
- 확인: `MOCK_AI=1`에서 없는 ID와 진행자 ID가 "근거 없음"으로 표시되고 `analysis_runs.dropped`에 이유와 함께 남는다.

### 5단계 — 질문·답변 (RAG)

- 파일: `supabase/migrations/0004_vector.sql`(pgvector, 임베딩 열, `match_utterances`), `lib/ai/embed.ts`, `prompts/근거.md`, `lib/ai/answer.ts`, `app/ask/page.tsx`
- 흐름: 참가자 발언만 검색 → 답변 문장별 발언 ID → 4단계 대조 함수 → 근거 없는 문장은 숨김 처리.
- 주의: 벡터 열의 차원은 임베딩 모델에 맞춰 정한다. `OPENAI_EMBEDDING_MODEL`을 차원이 다른 모델로 바꾸면 마이그레이션과 재임베딩이 필요하다.
- 확인: 전사본에 있는 내용을 물으면 답 + 인용, 없는 내용을 물으면 "원문에서 근거를 찾지 못했습니다".

### 6단계 — 상태 화면과 방어

- 파일: 화면별 `loading.tsx`, `app/error.tsx`(2단계에서 만든 것을 다듬는다), 업로드 상태(빈 상태, 업로드 중, 형식 오류, 개인정보 경고), 작은 화면·긴 텍스트, `data/test/`(빈 파일, 제한 초과, 가짜 연락처)
- 전사본·발언 저장을 한 번에 처리한다: 지금은 요청 두 번이라 발언 저장이 실패하면 전사본을 지워 되돌린다(`lib/store.ts`의 `shortcut:` 주석). DB 함수 하나(rpc)로 합쳐 한 트랜잭션으로 만들고, 마이그레이션과 `docs/db.md`를 함께 고친다.
- ~~성공 메시지 강조~~: Montage 적용 때 초록 알림 상자(`SectionMessage`)로 바꿔 해결했다.
- 개발 서버 경고 정리: `npm run dev` 터미널에 "`Date.now()` while prerendering"(`/`, `/insights`)와 "URL data during prerendering or a navigation"(`/ask`)이 반복해서 찍힌다. 화면은 정상으로 나오고 빌드도 통과한다. 화면별 `loading.tsx`/`<Suspense>`를 넣을 때 함께 없앤다.
- 확인(PRD 8번): 빈 파일, 제한 초과, 가짜 연락처, 전사본에 없는 질문, 키 누락, 시크릿 창 접근 차단.

### 7단계 — 배포

- 파일: `README.md`(고른 메뉴 표, AI 사용 지도, Montage MIT 라이선스 표기), Vercel 환경 변수, 푸시 전 키·개인정보 점검
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

## 의도적 오류 데이터

사용성 테스트에서 "잘못된 근거를 찾아내는지" 보는 재료다. 고치지 않는다. 모두 가짜 데이터(`lib/mock.ts`)에 있어서, 질문·답변을 실제 데이터에 연결하는 5단계에서 이 파일을 지우면 함께 사라진다. 테스트에 계속 쓰려면 그 전에 옮길 곳을 정한다.

| 위치 | 내용 | 화면에서 보이는 모습 |
| --- | --- | --- |
| 질문·답변 두 번째 문장 "연장 버튼을 찾지 못해 자리가 풀린 경우도 있습니다"의 근거 Y-06 | Y-06은 "화장실 다녀온 사이에 다른 사람이 예약해 버렸어요"로, 연장 버튼 이야기가 아니다. 처음부터 오류로 넣은 것은 아니고(자리가 풀린 경위를 잇는 발언이라 근거로 달았다), 2026-11-19에 테스트 재료로 남기기로 했다 | 실제 참가자 발언이라 대조를 통과해 정상 인용 카드(3번)로 보인다. 사람이 읽어야 알 수 있는 오류다 |
| 주제 묶음 2번의 근거 Y-05, 질문·답변 네 번째 문장의 근거 Y-05 | 진행자 발언 | "근거 없음" (진행자 발언은 근거로 쓰지 않는다) |
| 주제 묶음 3번의 근거 Z-99, 질문·답변 세 번째 문장의 근거 Z-99 | 원문에 없는 ID | "근거 없음" (원문에 없다) |

## 넣지 않는 것

Playwright QA, 질문·답변 기록 저장, "전해 들은 말·추측" 자동 표시, 정답 라벨 채점 스크립트. 필요해지면 그때 추가한다.
