import test from "node:test";
import assert from "node:assert/strict";
import { classifyApiError, failure, failureFromError } from "./failure.ts";

const KINDS = ["network", "transient", "model", "key", "quota", "request", "setup", "format", "start", "limit"];
const both = (kind, extra = {}) => [
  failure(kind, { task: "search", dev: false, ...extra }),
  failure(kind, { task: "analysis", dev: false, ...extra }),
];

test("OpenAI 오류를 다시 해서 풀릴 수 있는지로 나눈다", () => {
  const c = (e) => classifyApiError(e);
  assert.equal(c({ status: 404 }), "model");
  assert.equal(c({ code: "model_not_found" }), "model");
  assert.equal(c({ status: 401 }), "key");
  assert.equal(c({ code: "invalid_api_key" }), "key");
  assert.equal(c({ code: "insufficient_quota", status: 429 }), "quota"); // 429로 와도 크레딧 부족은 일시 장애가 아니다
  assert.equal(c({ status: 400 }), "request");
  for (const e of [{ status: 429 }, { status: 408 }, { status: 500 }, { status: 503 }, { name: "APIConnectionTimeoutError" }, { code: "ECONNRESET" }, new Error("?"), null, undefined, "문자열"])
    assert.equal(c(e), "transient", JSON.stringify(e));
});

test("다시 시도 버튼은 다시 해서 풀릴 수 있는 실패에만 있다", () => {
  const retry = (kind) => failure(kind, { task: "search", dev: false }).retry;
  for (const kind of ["network", "transient", "format", "verify", "start"]) assert.equal(retry(kind), true, kind);
  for (const kind of ["model", "key", "quota", "request", "setup", "limit"]) assert.equal(retry(kind), false, kind);
  assert.equal(failure("save", { task: "analysis", dev: false }).retry, true);
  // 개발 환경이어도 같다: 키 오류를 개발 화면에서 눌러도 똑같이 실패한다
  for (const kind of ["model", "key", "quota", "request", "setup"]) assert.equal(failure(kind, { task: "search", dev: true }).retry, false, `dev ${kind}`);
});

test("횟수에 들어가는 실패와 빠지는 실패를 문구가 밝힌다", () => {
  for (const [kind, task] of [["format", "search"], ["format", "analysis"], ["save", "analysis"]]) {
    const f = failure(kind, { task, dev: false });
    assert.equal(f.counted, true, `${kind}/${task}`);
    assert.match(f.message, /이번 시도는 오늘 횟수에 포함돼요\.$/);
  }
  for (const [kind, task] of [["transient", "search"], ["transient", "analysis"], ["verify", "search"], ["model", "search"], ["key", "analysis"], ["quota", "search"], ["request", "analysis"], ["setup", "search"]]) {
    const f = failure(kind, { task, dev: false });
    assert.equal(f.counted, false, `${kind}/${task}`);
    assert.match(f.message, /이번 시도는 횟수에서 빠졌어요\.$/, `${kind}/${task}`);
  }
  // 연결이 끊긴 경우는 서버가 요청을 받았는지 알 수 없어 횟수를 말하지 않는다
  for (const f of both("network")) {
    assert.equal(f.counted, null);
    assert.doesNotMatch(f.message, /횟수/);
  }
});

test("배포 환경에서는 키·모델·크레딧 같은 원인이 문구에 나오지 않는다", () => {
  const leak = /OPENAI|\.env|API|모델|크레딧|환경 변수|서버를 다시 시작|서버 기록/;
  for (const kind of KINDS) for (const f of [...both(kind), ...both(kind, { stage: "embed" })]) assert.doesNotMatch(f.message, leak, `${kind}: ${f.message}`);
  // 서비스 설정 문제는 네 가지 모두 같은 말이다
  for (const task of ["search", "analysis"])
    assert.equal(new Set(["model", "key", "quota", "request", "setup"].map((k) => failure(k, { task, dev: false }).message)).size, 1);
});

test("서비스 설정 문제의 배포 문구", () => {
  assert.equal(failure("key", { task: "search", dev: false }).message, "지금은 찾을 수 없어요. 서비스 쪽 문제라 직접 고칠 수는 없어요. 나중에 다시 시도해 주세요. 이번 시도는 횟수에서 빠졌어요.");
  assert.equal(failure("model", { task: "analysis", dev: false }).message, "지금은 분석할 수 없어요. 서비스 쪽 문제라 직접 고칠 수는 없어요. 나중에 다시 시도해 주세요. 이번 시도는 횟수에서 빠졌어요.");
});

test("개발 환경에서는 원인과 고치는 방법을 알려 준다", () => {
  const d = (kind, extra) => failure(kind, { task: "search", dev: true, ...extra }).message;
  assert.equal(d("model", { stage: "embed" }), "OPENAI_EMBEDDING_MODEL에 적은 모델을 찾지 못했어요. 이름을 소문자까지 정확히 적어 주세요.");
  assert.equal(d("model", { stage: "answer" }), "OPENAI_MODEL에 적은 모델을 찾지 못했어요. 이름을 소문자까지 정확히 적어 주세요.");
  assert.equal(d("model"), d("model", { stage: "answer" })); // 단계를 모르면 답변 단계로 본다
  assert.equal(d("key"), "OPENAI_API_KEY가 올바르지 않아요. .env.local 값을 확인하고 서버를 다시 시작해 주세요.");
  assert.equal(d("quota"), "OpenAI 크레딧이 부족해요. 충전한 뒤 다시 시도해 주세요.");
  assert.equal(d("request"), "OpenAI가 요청을 받아 주지 않았어요. 서버 기록을 확인해 주세요.");
  assert.equal(d("setup"), "OpenAI 설정이 없어요. .env.local에 OPENAI_API_KEY, OPENAI_MODEL, OPENAI_EMBEDDING_MODEL을 넣고 서버를 다시 시작해 주세요.");
  assert.equal(failure("setup", { task: "analysis", dev: true }).message, "OpenAI 설정이 없어요. .env.local에 OPENAI_API_KEY, OPENAI_MODEL을 넣고 서버를 다시 시작해 주세요.");
});

test("검색과 분석 문구: 표의 A1·A2·A8~A11", () => {
  const s = (kind) => failure(kind, { task: "search", dev: false }).message;
  const a = (kind) => failure(kind, { task: "analysis", dev: false }).message;
  assert.equal(s("network"), "연결이 끊겨서 찾지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  assert.equal(a("network"), "연결이 끊겨서 분석하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  assert.equal(s("transient"), "지금은 찾을 수 없어요. 잠시 뒤 다시 시도해 주세요. 이번 시도는 횟수에서 빠졌어요.");
  assert.equal(a("transient"), "지금은 분석할 수 없어요. 잠시 뒤 다시 시도해 주세요. 이번 시도는 횟수에서 빠졌어요.");
  assert.equal(s("format"), "답변을 제대로 만들지 못했어요. 다시 시도해 주세요. 이번 시도는 오늘 횟수에 포함돼요.");
  // 기존 묶음이 없으면 "기존 묶음은 그대로예요" 문장을 뺀다
  assert.equal(a("format"), "분석 결과를 제대로 만들지 못해 저장하지 않았어요. 다시 시도해 주세요. 이번 시도는 오늘 횟수에 포함돼요.");
  assert.equal(a("save"), "분석 결과를 저장하지 못했어요. 다시 시도해 주세요. 이번 시도는 오늘 횟수에 포함돼요.");
  const withOld = (kind) => failure(kind, { task: "analysis", dev: false, existing: true }).message;
  assert.equal(withOld("format"), "분석 결과를 제대로 만들지 못해 저장하지 않았어요. 기존 묶음은 그대로예요. 다시 시도해 주세요. 이번 시도는 오늘 횟수에 포함돼요.");
  assert.equal(withOld("save"), "분석 결과를 저장하지 못했어요. 기존 묶음은 그대로 있어요. 다시 시도해 주세요. 이번 시도는 오늘 횟수에 포함돼요.");
  assert.equal(s("verify"), "답변이 원문과 맞는지 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요. 이번 시도는 횟수에서 빠졌어요.");
  assert.equal(s("start"), "검색을 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  assert.equal(a("start"), "분석을 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
});

test("한도 문구와 하루 횟수", () => {
  assert.equal(failure("limit", { task: "search", dev: false, max: 30 }).message, "오늘 검색 30회를 모두 썼어요. 자정(한국 시간)이 지나면 다시 찾을 수 있어요.");
  assert.equal(failure("limit", { task: "analysis", dev: false, max: 10 }).message, "오늘 분석 10회를 모두 썼어요. 자정(한국 시간)이 지나면 다시 분석할 수 있어요.");
  assert.equal(failure("limit", { task: "search", dev: false }).message.includes("30회"), true); // max를 안 주면 기본 횟수
});

test("한 종류의 실패는 한 가지 말투(해요체)로만 쓴다", () => {
  for (const kind of KINDS) for (const dev of [true, false]) for (const task of ["search", "analysis"]) {
    const m = failure(kind, { task, dev }).message;
    assert.doesNotMatch(m, /(습니다|입니다|합니다|됩니다)/, m);
  }
});

test("OpenAI 오류에서 바로 문구를 만든다", () => {
  const f = failureFromError({ status: 401 }, { task: "search", dev: true });
  assert.equal(f.kind, "key");
  assert.equal(f.retry, false);
  assert.equal(failureFromError(new Error("모름"), { task: "analysis", dev: false }).kind, "transient");
});

test("검색에 save, 분석에 verify를 쓰면 프로그래밍 오류로 알린다", () => {
  assert.throws(() => failure("save", { task: "search", dev: false }));
  assert.throws(() => failure("verify", { task: "analysis", dev: false }));
});
