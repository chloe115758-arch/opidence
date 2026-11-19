import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseTranscript } from "./transcript.ts";

const good = `[가상 인터뷰 데이터 — 실제 인물 아님]
참가자 A | 20대 후반 | 직장인

A-01 진행자: 언제 쓰세요?
A-02 참가자 A: 출퇴근할 때요. 걸으면 15분인데요.
`;
const messages = (text) => {
  const r = parseTranscript(text);
  assert.equal(r.ok, false, "막혀야 하는데 통과했다");
  return r.problems.map((p) => `${p.line ?? "-"}:${p.message}`).join("\n");
};

test("정상 파일: 화자와 발언 ID를 나눈다", () => {
  const r = parseTranscript(good);
  assert.equal(r.ok, true);
  assert.equal(r.label, "A");
  assert.equal(r.meta, "20대 후반 | 직장인");
  assert.deepEqual(
    r.utterances.map((u) => [u.id, u.seq, u.role, u.text]),
    [
      ["A-01", 1, "moderator", "언제 쓰세요?"],
      ["A-02", 2, "participant", "출퇴근할 때요. 걸으면 15분인데요."],
    ],
  );
});

test("샘플 8건: 발언 114개, 참가자 발언 57개", () => {
  const all = "ABCDEFGH".split("").map((l) => {
    const r = parseTranscript(fs.readFileSync(`data/interviews/interview_${l}.txt`, "utf8"));
    assert.equal(r.ok, true, `interview_${l}: ${JSON.stringify(r.problems)}`);
    assert.equal(r.label, l);
    return r.utterances;
  });
  assert.equal(all.flat().length, 114);
  assert.equal(all.flat().filter((u) => u.role === "participant").length, 57);
});

test("빈 파일과 긴 파일을 막는다", () => {
  assert.match(messages(""), /비어 있습니다/);
  assert.match(messages(" \n\n"), /비어 있습니다/);
  assert.match(messages(good + "A-03 진행자: " + "가".repeat(10000)), /10,000자까지/);
});

test("형식 오류: 줄 번호와 고치는 방법을 알려 준다", () => {
  assert.match(messages(good.replace("A-02 참가자 A:", "A-02 김민수:")), /^5:화자는 '진행자' 또는 '참가자 A'처럼/);
  assert.match(messages(good.replace("A-02", "A-03")), /^5:.*A-02이어야 합니다\(현재 A-03\)/);
  assert.match(messages(good.replace("A-02", "A-2")), /^5:.*A-02이어야/);
  assert.match(messages(good.replace("A-02 참가자 A", "A-02 참가자 B")), /^5:화자를 '참가자 A'로/);
  assert.match(messages(good.replace("A-01", "B-01")), /^4:.*A-01이어야/);
  assert.match(messages(good + "줄이 바뀐 발언\n"), /^6:.*한 줄로 합쳐/);
  assert.match(messages(good.replace("참가자 A | 20대 후반 | 직장인\n", "")), /^3:.*참가자 라벨 줄을/);
  assert.match(messages("참가자 A | 설명\nA-01 진행자: 질문만 있어요?\n"), /참가자 발언이 없습니다/);
});

test("개인정보 형태가 있으면 막는다 (예시는 모두 가짜 값)", () => {
  assert.match(messages(good + "A-03 진행자: 010-0000-0000으로 연락드릴게요.\n"), /^6:전화번호 형태/);
  assert.match(messages(good + "A-03 진행자: 02 000 0000 맞으시죠?\n"), /^6:전화번호 형태/);
  assert.match(messages(good + "A-03 진행자: test@example.com 맞으시죠?\n"), /^6:이메일 형태/);
  assert.match(messages(good + "A-03 진행자: 000000-1000000 확인했습니다.\n"), /^6:주민등록번호 형태/);
});
