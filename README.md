# Opidence

인터뷰 전사본에서 비슷한 발언을 주제별로 묶고, **모든 묶음에 원문 발언 번호를 근거로 붙이는** 웹 서비스예요.

[이름] · AI 네이티브 커리어캠프 2기 · 디자인

배포 주소: _(제출서에 적어요)_

## 한 줄로 말하면

AI가 묶음 제목과 요약을 써도, **화면에 보이는 인용 문장은 언제나 DB에 저장된 원문**이에요. 그래서 AI가 지어낸 근거는 걸러지고, 근거를 못 찾으면 "원문에서 근거를 찾지 못했어요"라고 말해요.

## 근거 규칙 (이 서비스의 핵심)

1. AI는 인용 문장을 쓰지 않아요. **발언 번호(예: A-04)만 돌려줘요.**
2. 화면의 인용은 번호로 DB 원문을 찾아 보여 줘요. AI가 쓴 글자는 인용 자리에 들어가지 않아요.
3. 없는 번호와 진행자 발언 번호는 근거로 인정하지 않고 "근거 없음"으로 표시해요. 비슷한 번호를 고쳐 주지도 않아요.
4. 근거를 못 찾으면 지어내지 않아요. "근거 없음"은 오류가 아니라 정상 상태로 디자인했어요(오류 색 대신 중립 색).

코드가 확인하는 것은 "근거 발언이 원문에 있고 참가자 것인가"까지예요. **그 발언이 묶음의 뜻과 맞는지는 코드가 가리지 못해요.** 그래서 화면과 리포트에서 사람이 대조할 수 있게(참가자 라벨, 발언 번호, 원문 위치) 보여 줘요.

## 화면

| 화면 | 하는 일 |
| --- | --- |
| 전사본 | txt 전사본을 올려요(여러 파일 한 번에, 최대 10건, 한 파일 10,000자). 발언 번호가 없어도 규칙으로 자동 정리해요(AI 없음). 역할을 알 수 없는 파일(클로바노트의 "참석자 1", 이름 등)은 저장하기 전에 화자마다 진행자·참가자를 고르게 해요. |
| 주제 분류 | "분석하기"로 비슷한 발언을 묶어요. 묶음마다 제목, 요약, 원문 인용을 보여 줘요. **리포트 내보내기**: 묶음과 원문 인용을 Markdown 파일로 받거나 복사해요(AI를 새로 쓰지 않아요). |
| 검색 · 찾기 | 질문에 맞는 참가자 발언을 찾아 2~3문장으로 요약하고, 문장마다 근거 번호를 붙여요. 근거 없는 문장은 기본으로 숨겨요. |
| 원문 보기 | 인용에서 한 번에 닿는 원문 위치예요. 참가자 라벨과 발언 번호를 함께 보여 줘요. |

사용자 구분은 Supabase 익명 로그인이에요. 로그인 화면은 없어요.

## 고른 메뉴

| 메뉴 | 어디에 썼나 | 맡은 사람 |
| --- | --- | --- |
| Supabase DB | 전사본, 발언, 인사이트(묶음), 근거 저장. `docs/db.md` 설계와 RLS 적용 | 나 |
| RAG 챗봇 (LangChain) | 전사본에서 근거 발언을 찾아 답하고 인용을 붙이기 | 나 |
| (선택) Playwright QA | 하지 않았어요. 대신 단위 테스트(`npm test`)와 방어 점검표(`docs/plan.md` 6-6)로 확인했어요 | — |

## AI 사용 지도

| 부분 | 만든 도구 | 쓴 프롬프트·스킬 | 사람이 결정한 것 |
| --- | --- | --- | --- |
| 주제 분류 | OpenAI API(LangChain.js `ChatOpenAI`) | `prompts/묶음.md` v1 | 묶음 기준과 이름, 근거는 번호만 받는 규칙 |
| 검색 · 찾기 | 임베딩(OpenAI, 직접 호출) + 답변(LangChain.js) | `prompts/근거.md` v1 | 인용 허용 규칙, 근거 없음 판단, 근거 표시 방식(B안 기본) |
| 전사본 자동 정리·화자 확인·개인정보 검사·리포트 | **AI 없음**(규칙과 코드) | — | 규칙의 범위, 사용자가 역할을 직접 고르게 한 것 |
| 화면 | Claude Code, Montage 디자인 시스템 | `CLAUDE.md`의 화면 규칙, `ux-writing-kr` 스킬(문구) | 해요체 통일, 용어("묶음"), 인용 세로 띠 같은 디자인 판단 |

- **질문 개수·점수 같은 계산은 AI가 하지 않아요.** AI는 읽고 묶고 요약만 하고, 개수·횟수·검증은 코드가 해요.
- 프롬프트는 `prompts/`에 버전을 붙여 쌓아요. 코드는 가장 아래 버전을 써요. 현재 둘 다 v1이고, v2는 4일차 측정 뒤에 반영할 예정이에요.
- 모델 이름은 코드에 쓰지 않고 환경 변수로만 지정해요.
- 임베딩만 OpenAI를 `fetch`로 직접 불러요. LangChain의 임베딩 호출은 토큰 수를 돌려주지 않아서, `search_runs`에 실제 토큰 수를 남기려고 임베딩만 직접 불렀어요. 답변 생성은 LangChain.js를 써요.

## 안전 장치

| 위험 | 막는 방법 |
| --- | --- |
| 개인정보 | 전화번호·이메일·주민등록번호 형태는 올리기 전에 막고 몇 번째 줄인지 알려 줘요. **이름은 자동으로 찾지 못해요**: 업로드 화면에 "본문의 이름은 직접 확인해 주세요"를 늘 보여 줘요. 리포트에도 같은 안내가 있어요. |
| 빈 파일·너무 긴 파일·형식 오류 | 저장하지 않고 이유와 고치는 방법을 알려 줘요. 한 파일은 10,000자(녹음 약 35분)까지예요. |
| 근거 없는 질문 | "원문에서 근거를 찾지 못했어요". 지어내지 않아요. |
| AI 호출 실패 | 화면 안에 안내하고 입력한 질문과 결과를 지우지 않아요. 연결 끊김처럼 다시 하면 풀릴 수 있을 때만 "다시 시도" 버튼을 보여 줘요. 키·모델 이름 같은 원인은 개발 환경에서만 보여 주고 배포에서는 서버 기록에만 남겨요. |
| 횟수 | 하루 분석 10회, 검색 30회(사용자별, 한국 시간 자정 기준). DB 트리거가 막아요. |
| 다른 사용자 데이터 | 일곱 테이블 모두 RLS가 켜져 있고 `anon` 권한이 없어요. Supabase service role 키는 쓰지 않아요. |

확인 방법은 `docs/plan.md`의 **6-6 방어 점검표**에 있어요.

## 로컬에서 실행하기

필요한 것: Node.js(개발은 24에서 했어요), Supabase 프로젝트, OpenAI API 키.

1. `npm install`
2. `.env.example`을 `.env.local`로 복사하고 값을 채워요.
3. Supabase 대시보드에서 **익명 로그인(Anonymous sign-ins)** 을 켜요.
4. SQL Editor에서 `supabase/migrations/`를 **번호 순서대로** 실행해요: `0001_init` → `0002_analysis` → `0003_analysis_limit` → `0004_search`(pgvector) → `0005_save_transcript`. 각 파일 맨 아래 확인 쿼리로 결과를 확인해요(`docs/db.md`).
5. `npm run dev` → `http://localhost:3000`. 처음에는 전사본 화면의 "샘플 인터뷰 8건 불러오기"를 눌러 보세요.
6. `npm test`로 테스트를 돌려요.

| 환경 변수 | 어디서 | 브라우저에 보이나 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API | 보여요(RLS로 보호) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 같은 곳(publishable 키) | 보여요(RLS로 보호) |
| `OPENAI_API_KEY` | OpenAI | **안 보여요**(서버 전용) |
| `OPENAI_MODEL` | 답변·분석에 쓸 모델 이름 | 안 보여요 |
| `OPENAI_EMBEDDING_MODEL` | 임베딩 모델 이름. DB 벡터 열이 1536차원이라 1536차원 모델이어야 해요 | 안 보여요 |

키는 `.env.local`에만 두고 저장소에 올리지 않아요(`.gitignore`). 개발 전용으로 `MOCK_AI=1`을 주면 OpenAI를 부르지 않고 "근거 없음" 경로를 일부러 만드는 가짜 응답을 써요. 배포(production)에서는 무시돼요.

## 폴더

| 위치 | 내용 |
| --- | --- |
| `app/`, `components/` | 화면(Next.js App Router), 서버 액션 |
| `lib/` | 전사본 읽기·화자 확인·근거 대조·실패 문구·리포트 같은 규칙(테스트 `*.test.mjs`)과 `lib/ai/`(서버 전용 AI 호출) |
| `prompts/` | 버전을 붙인 프롬프트 `묶음.md`, `근거.md` |
| `supabase/migrations/` | DB 마이그레이션 0001~0005 |
| `data/interviews/` | 가상 인터뷰 8건(참가자 A~H, 공공자전거 앱) |
| `data/test/` | 방어용 가짜 전사본 24개와 기대 결과(`README.md`) |
| `docs/` | `PRD.md`, `plan.md`(결정 기록·방어 점검표), `db.md`, `평가리포트.md`, `측정쿼리.sql`, `위임로그/` |

## 데이터

공개 배포에는 **직접 만든 가상 인터뷰 8건**만 써요. 실제 사람의 이름, 연락처, 회사 정보는 없고, `data/test/`의 연락처도 누가 봐도 가짜인 값이에요(`010-0000-0000`, `test@example.com`). 가상 데이터라 실제 참가자의 발화와 다르다는 한계가 있어요.

## 뺀 기능과 이유

5일 안에 **전사본 → 주제 분류 → 근거 연결 → 검색 · 찾기**만 만들었어요.

| 뺀 것 | 이유 |
| --- | --- |
| 음성 파일 → 글 변환 | 5일 범위를 넘어요 |
| 영어 등 다국어 인터뷰 | 한국어로 정해 범위를 줄였어요 |
| 드래그로 옮기는 어피니티 보드 | 화면 구현 비용이 크고 핵심 가치와 직접 관련이 적어요 |
| 설문, FGI 등 다른 리서치 데이터 | 핵심 흐름 1개에 집중했어요. 발언이 3개 이상인 참가자가 둘 이상이면 "지금은 1:1 인터뷰만 올릴 수 있어요"로 막아요 |
| 팀 협업, 여러 사용자 관리 | 개인 프로젝트 범위를 넘어요 |
| 공유 링크, 대시보드 | 리포트는 Markdown 파일과 복사까지만 해요 |

## 알려진 한계

- **뜻은 코드가 못 가려요.** 의도적 오류 데이터의 C-08처럼 원문에 있는 참가자 발언이어도 묶음과 뜻이 반대일 수 있어요. 사람이 읽어야 해요.
- **분석 결과가 매번 조금 달라요.** 같은 전사본으로 묶음이 7개, 6개, 5개로 나온 적이 있어요(`docs/plan.md` 4일차 측정).
- **한 파일은 10,000자(녹음 약 35분)까지예요.** 인터뷰를 나누어 올리면 같은 참가자가 파일마다 다른 참가자로 잡혀 "몇 명이 말했나"가 부풀려져서, 나누어 올리라고 안내하지 않아요.
- **이름은 자동으로 못 찾아요.** 개인정보는 형태(연락처 등)만 잡아요.
- **클로바노트 형식은 실제 파일로 확인했지만, Zoom 같은 다른 도구의 전사본은 확인하지 않았어요.** 화자를 못 알아보면 저장하기 전에 직접 고르게 해요.
- **익명 로그인이라 하루 횟수는 사용자별이에요.** 계정을 계속 새로 만들면 횟수를 피할 수 있어요. 비용은 OpenAI 선불 크레딧 한도로 막아요.
- 표본이 작아서 평가 결과는 "이 조건에서 관찰된 경향"이에요(`docs/평가리포트.md`).

## 문서

- 요구사항 `docs/PRD.md`
- 작업 계획·결정 기록·방어 점검표 `docs/plan.md`
- DB 설계와 RLS `docs/db.md`
- 평가 리포트 `docs/평가리포트.md`, 측정 쿼리 `docs/측정쿼리.sql`
- 위임 로그 `docs/위임로그/`

## 라이선스와 고지

- 이 저장소의 코드 라이선스는 아직 정하지 않았어요.
- 화면 컴포넌트는 [Montage](https://github.com/wanteddev/montage-web)(`@montage-ui/core`, `@montage-ui/nextjs`, MIT, Copyright (c) 2026 Wanted Lab, Inc.)를 써요. **원티드 로고와 `wanted` 로딩 애니메이션은 쓰지 않아요.** 라이선스 전문은 아래에 있어요.
- 문구 작성 스킬(`.claude/skills/ux-writing-kr`)은 MIT 라이선스이고, 그 안의 번역투 분류는 MIT 프로젝트 [im-not-ai (humanize-korean)](https://github.com/epoko77-ai/im-not-ai)(Copyright (c) 2026 epoko77-ai)에서 영감을 받았어요. 고지는 스킬 폴더의 `LICENSE`에 있어요.
- 그 밖의 라이브러리(Next.js, React, Tailwind CSS, Supabase, LangChain.js 등)는 각자의 라이선스를 따라요(`package.json`).

<details>
<summary>Montage 라이선스 전문</summary>

```text
MIT License

Copyright (c) 2026 Wanted Lab, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

</details>
