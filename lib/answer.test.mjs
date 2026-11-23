import test from "node:test";
import assert from "node:assert/strict";
import { formatQuestion, parseAnswer } from "./answer.ts";

const s = (text, ids = []) => ({ text, utterance_ids: ids });

test("형식이 맞는 응답은 통과하고 같은 ID는 하나로 합쳐진다", () => {
  assert.deepEqual(parseAnswer({ sentences: [s("가", ["A-01", "A-01"])] }), [s("가", ["A-01"])]);
  assert.deepEqual(parseAnswer({ sentences: [] }), []); // 근거를 못 찾은 응답도 정상
});

test("형식이 틀리면 null이다: 문장 4개, 빈 문장, 모르는 키, 인용 문장 자리", () => {
  assert.equal(parseAnswer({ sentences: [s("1"), s("2"), s("3"), s("4")] }), null);
  assert.equal(parseAnswer({ sentences: [s("  ")] }), null);
  assert.equal(parseAnswer({ sentences: [{ ...s("가"), quote: "원문" }] }), null);
  assert.equal(parseAnswer({ answer: "글" }), null);
  assert.equal(parseAnswer(null), null);
});

test("보낼 글은 질문과 번호가 붙은 발언이다", () => {
  const text = formatQuestion("반납은?", [{ id: "A-08", label: "A", seq: 8, role: "participant", text: "신경 쓰여요" }]);
  assert.equal(text, "<질문>\n반납은?\n</질문>\n\n<발언>\nA-08 참가자 A: 신경 쓰여요\n</발언>");
});
