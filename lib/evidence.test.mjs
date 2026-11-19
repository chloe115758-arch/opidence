import test from "node:test";
import assert from "node:assert/strict";
import { checkEvidence } from "./evidence.ts";

const utterances = [
  { id: "A-01", label: "A", seq: 1, role: "moderator", text: "질문" },
  { id: "A-02", label: "A", seq: 2, role: "participant", text: "답" },
];

test("참가자 발언 ID만 근거로 인정한다", () => {
  assert.equal(checkEvidence("A-02", utterances).status, "verified");
  assert.equal(checkEvidence("A-01", utterances).status, "moderator");
  assert.equal(checkEvidence("Z-99", utterances).status, "not_found");
  assert.equal(checkEvidence("a-02", utterances).status, "not_found");
  assert.equal(checkEvidence("A-02 ", utterances).status, "not_found");
});
