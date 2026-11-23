import test from "node:test";
import assert from "node:assert/strict";
import { mockClusters } from "./ai/fixture.ts";
import { parseClusters } from "./cluster.ts";
import { checkEvidence } from "./evidence.ts";

const u = (id, role, seq) => ({ id, label: id[0], seq, role, text: `발언 ${id}` });
const transcripts = [
  { label: "A", meta: "", utterances: [u("A-01", "moderator", 1), u("A-02", "participant", 2), u("A-03", "participant", 3), u("A-04", "participant", 4), u("A-05", "participant", 5)] },
];
const utterances = transcripts.flatMap((t) => t.utterances);

test("가짜 응답은 형식 검사를 통과한다", () => {
  assert.ok(parseClusters(mockClusters(transcripts).output));
});

test("묶음별로 기대한 근거 상태가 나온다", () => {
  const status = (c) => c.utterance_ids.map((id) => checkEvidence(id, utterances).status);
  const [ok, mixed, none, variant, empty, dup] = parseClusters(mockClusters(transcripts).output);
  assert.deepEqual(status(ok), ["verified", "verified", "verified"]);
  assert.deepEqual(status(mixed), ["verified", "not_found", "moderator"]);
  assert.deepEqual(status(none), ["not_found", "moderator"]);
  assert.deepEqual(status(variant), ["not_found", "not_found"]); // 소문자·앞 공백 ID는 고쳐 주지 않는다
  assert.deepEqual(empty.utterance_ids, []);
  assert.deepEqual(dup.utterance_ids, ["A-02"]); // 중복은 하나로 합쳐진다
});

test("가짜 임베딩은 1536차원이고 글이 같으면 같다", async () => {
  const { mockEmbedding } = await import("./ai/fixture.ts");
  assert.equal(mockEmbedding("가").length, 1536);
  assert.deepEqual(mockEmbedding("가"), mockEmbedding("가"));
  assert.notDeepEqual(mockEmbedding("가"), mockEmbedding("나"));
});
