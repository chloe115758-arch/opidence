// 검색 · 찾기와 주제 분류가 실패했을 때 사용자에게 보여 줄 문구와 "다시 시도" 여부.
// 서버 액션과 화면이 함께 쓰고, 문구 규칙은 docs/plan.md "6-4"의 표(A·B)를 따른다.
// 다른 lib 파일을 불러오지 않는 순수 함수라서 테스트에서 그대로 부를 수 있다.

export type Task = "search" | "analysis"; // 검색 · 찾기 / 주제 분류의 분석
export type Stage = "embed" | "answer"; // 검색 중 어느 단계에서 실패했나(모델 이름 오류 안내가 달라진다)

export type FailureKind =
  | "network" // 연결 끊김(화면에서 요청이 서버에 닿지 못함)
  | "transient" // 일시 장애·시간 초과·알 수 없는 오류: 다시 하면 풀릴 수 있다
  | "model" // 모델 이름 오류
  | "key" // 키 오류
  | "quota" // 크레딧 부족
  | "request" // 요청 거부(400)
  | "setup" // 설정 미비(환경 변수 없음)
  | "format" // AI 답이 형식에 맞지 않음
  | "save" // 분석 결과 저장 실패(분석 전용)
  | "verify" // 원문 대조 실패(검색 전용)
  | "start" // 기록을 만들지 못해 시작 못 함
  | "limit"; // 하루 횟수를 모두 씀

export type Failure = {
  kind: FailureKind;
  message: string;
  // 다시 해서 풀릴 수 있는 실패에만 true. 화면은 true일 때만 "다시 시도" 버튼을 보여 준다.
  retry: boolean;
  // 이번 시도가 하루 횟수에 들어가는가. null이면 서버가 요청을 받았는지 알 수 없다(연결 끊김).
  counted: boolean | null;
};

export type Context = {
  task: Task;
  // true면 원인(키, 모델 이름, 크레딧)을 문구에 쓴다. 배포(NODE_ENV=production)에서는 false로 불러 원인을 숨긴다(서버 기록에만 남긴다).
  dev: boolean;
  stage?: Stage; // kind가 "model"일 때 개발 문구가 어느 환경 변수를 가리킬지 정한다. 기본은 답변 단계.
  max?: number; // kind가 "limit"일 때 하루 횟수
};

type ApiError = { name?: string; status?: number; code?: string };

// OpenAI·네트워크 오류를 "다시 하면 풀릴 수 있나"로 나눈다. 모르는 오류는 일시 장애로 본다.
// 순서가 중요하다: 크레딧 부족은 429로 오기도 하므로 일시 장애(429)보다 먼저 가른다.
export function classifyApiError(err: unknown): "transient" | "model" | "key" | "quota" | "request" {
  const { status, code } = (err ?? {}) as ApiError;
  if (code === "model_not_found" || status === 404) return "model";
  if (code === "invalid_api_key" || status === 401) return "key";
  if (code === "insufficient_quota") return "quota";
  if (status === 400) return "request";
  return "transient"; // 429, 408, 5xx, 시간 초과, 연결 오류, 그 밖의 모르는 오류
}

const SERVICE_SIDE = "서비스 쪽 문제라 직접 고칠 수는 없어요. 나중에 다시 시도해 주세요.";
const NOT_COUNTED = "이번 시도는 횟수에서 빠졌어요.";
const COUNTED = "이번 시도는 오늘 횟수에 포함돼요.";

export function failure(kind: FailureKind, { task, dev, stage = "answer", max }: Context): Failure {
  const search = task === "search";
  const couldNot = search ? "찾지 못했어요" : "분석하지 못했어요"; // ~하지 못했어요
  const cannotNow = search ? "찾을 수 없어요" : "분석할 수 없어요"; // ~할 수 없어요
  const make = (message: string, retry: boolean, counted: boolean | null): Failure => ({ kind, message, retry, counted });

  switch (kind) {
    case "network":
      return make(`연결이 끊겨서 ${couldNot}. 인터넷 연결을 확인하고 다시 시도해 주세요.`, true, null);
    case "transient":
      return make(`지금은 ${cannotNow}. 잠시 뒤 다시 시도해 주세요. ${NOT_COUNTED}`, true, false);

    // 서비스 설정 문제: 눌러도 똑같이 실패하므로 버튼이 없다. 원인은 개발 환경에서만 보여 준다.
    case "model":
      return make(
        dev
          ? `${stage === "embed" ? "OPENAI_EMBEDDING_MODEL" : "OPENAI_MODEL"}에 적은 모델을 찾지 못했어요. 이름을 소문자까지 정확히 적어 주세요.`
          : `지금은 ${cannotNow}. ${SERVICE_SIDE} ${NOT_COUNTED}`,
        false,
        false,
      );
    case "key":
      return make(dev ? "OPENAI_API_KEY가 올바르지 않아요. .env.local 값을 확인하고 서버를 다시 시작해 주세요." : `지금은 ${cannotNow}. ${SERVICE_SIDE} ${NOT_COUNTED}`, false, false);
    case "quota":
      return make(dev ? "OpenAI 크레딧이 부족해요. 충전한 뒤 다시 시도해 주세요." : `지금은 ${cannotNow}. ${SERVICE_SIDE} ${NOT_COUNTED}`, false, false);
    case "request":
      return make(dev ? "OpenAI가 요청을 받아 주지 않았어요. 서버 기록을 확인해 주세요." : `지금은 ${cannotNow}. ${SERVICE_SIDE} ${NOT_COUNTED}`, false, false);
    case "setup":
      return make(
        dev
          ? `OpenAI 설정이 없어요. .env.local에 ${search ? "OPENAI_API_KEY, OPENAI_MODEL, OPENAI_EMBEDDING_MODEL" : "OPENAI_API_KEY, OPENAI_MODEL"}을 넣고 서버를 다시 시작해 주세요.`
          : `지금은 ${cannotNow}. ${SERVICE_SIDE} ${NOT_COUNTED}`,
        false,
        false, // 호출하기 전에 막히므로 기록이 만들어지지 않는다
      );

    // AI는 응답했지만 쓸 수 없었던 경우: 하루 횟수에 들어간다.
    case "format":
      return make(
        search
          ? `답변을 제대로 만들지 못했어요. 다시 시도해 주세요. ${COUNTED}`
          : `분석 결과를 제대로 만들지 못해 저장하지 않았어요. 기존 묶음은 그대로예요. 다시 시도해 주세요. ${COUNTED}`,
        true,
        true,
      );
    case "save":
      if (search) throw new Error("save는 분석에서만 쓴다");
      return make(`분석 결과를 저장하지 못했어요. 기존 묶음은 그대로 있어요. 다시 시도해 주세요. ${COUNTED}`, true, true);
    case "verify":
      if (!search) throw new Error("verify는 검색에서만 쓴다");
      return make(`답변이 원문과 맞는지 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요. ${NOT_COUNTED}`, true, false);

    case "start":
      return make(`${search ? "검색을" : "분석을"} 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.`, true, false);
    case "limit":
      return make(
        `오늘 ${search ? "검색" : "분석"} ${max ?? (search ? 30 : 10)}회를 모두 썼어요. 자정(한국 시간)이 지나면 다시 ${search ? "찾을" : "분석할"} 수 있어요.`,
        false,
        false,
      );
  }
}

// OpenAI 호출 오류를 그대로 문구로 바꾸는 지름길. 서버 액션의 catch에서 쓴다.
export function failureFromError(err: unknown, ctx: Context): Failure {
  return failure(classifyApiError(err), ctx);
}
