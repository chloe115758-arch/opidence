import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MAX_CLUSTERS, formatTranscripts, latestPrompt, parseClusters } from "./cluster.ts";

const cluster = (over = {}) => ({ title: "제목", summary: "요약", utterance_ids: ["A-02"], ...over });

test("형식이 맞는 응답은 그대로 받는다", () => {
  assert.deepEqual(parseClusters({ clusters: [cluster()] }), [cluster()]);
  assert.deepEqual(parseClusters({ clusters: [] }), []);
});

test("없는 ID나 이상한 ID도 문자열이면 받는다(대조는 다음 단계에서 한다). 고치지 않는다", () => {
  const ids = ["Z-99", "a-04", " A-02"];
  assert.deepEqual(parseClusters({ clusters: [cluster({ utterance_ids: ids })] })[0].utterance_ids, ids);
});

test("한 묶음 안의 같은 ID는 하나로 합친다", () => {
  assert.deepEqual(parseClusters({ clusters: [cluster({ utterance_ids: ["A-02", "B-04", "A-02"] })] })[0].utterance_ids, ["A-02", "B-04"]);
});

test("형식이 틀리면 통째로 버린다", () => {
  const nine = Array.from({ length: MAX_CLUSTERS + 1 }, () => cluster());
  for (const bad of [
    null,
    "문자열",
    {},
    { clusters: nine }, // 묶음 9개
    { clusters: [cluster({ title: "" })] },
    { clusters: [cluster({ title: "가".repeat(201) })] },
    { clusters: [cluster({ utterance_ids: "A-02" })] },
    { clusters: [cluster({ utterance_ids: [4] })] },
    { clusters: [cluster({ quote: "인용 문장" })] }, // 정해지지 않은 키(인용 문장 자리)는 받지 않는다
    { clusters: [{ title: "제목", summary: "요약" }] },
  ])
    assert.equal(parseClusters(bad), null, JSON.stringify(bad)?.slice(0, 60));
  assert.equal(parseClusters({ clusters: nine.slice(0, MAX_CLUSTERS) }).length, MAX_CLUSTERS);
});

test("전사본은 화자와 발언 ID를 붙여 보낸다", () => {
  const text = formatTranscripts([
    {
      label: "A",
      meta: "20대",
      utterances: [
        { id: "A-01", label: "A", seq: 1, role: "moderator", text: "언제 쓰세요?" },
        { id: "A-02", label: "A", seq: 2, role: "participant", text: "매일요." },
      ],
    },
  ]);
  assert.equal(text, "<전사본>\n[참가자 A | 20대]\nA-01 진행자: 언제 쓰세요?\nA-02 참가자 A: 매일요.\n</전사본>");
});

test("프롬프트는 가장 아래 버전을 쓴다", () => {
  assert.deepEqual(latestPrompt("# 제목\n## v1\n설명\n```text\n첫째\n```\n## v2\n```\n둘째\n줄\n```\n"), { version: "v2", text: "둘째\n줄" });
  assert.equal(latestPrompt("# 버전 없음"), null);
  assert.equal(latestPrompt("## v1\n코드 블록 없음"), null);
});

test("저장된 프롬프트 파일을 읽을 수 있고, 인용 문장을 요구하지 않는다", () => {
  const prompt = latestPrompt(fs.readFileSync(new URL("../prompts/묶음.md", import.meta.url), "utf8"));
  assert.match(prompt.version, /^v\d+$/);
  assert.match(prompt.text, /ID로만/);
});
