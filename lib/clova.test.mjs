import test from "node:test";
import assert from "node:assert/strict";
import { describeNotes, parseTranscript } from "./transcript.ts";

const P = "participant";
const M = "moderator";
const body = (...lines) => lines.join("\n");
const turns = body(
  "참석자 1 00:00", "안녕하세요.", "",
  "참석자 2 00:12", "네, 안녕하세요.", "",
  "참석자 1 00:31", "어떻게 쓰세요?", "",
  "참석자 2 00:40", "출퇴근길에 써요.",
);
const speakersOf = (r) => r.confirm.speakers.map((s) => `${s.token}:${s.count}`);

test("클로바 머리말: 콜론이 있는 제목과 시각이 있는 날짜 줄도 화자로 읽지 않는다", () => {
  const text = body("UX 인터뷰: 구독 서비스", "11월 23일 15:20", "김테스트", "", "", turns);
  const r = parseTranscript(text);
  assert.equal(r.ok, false);
  assert.deepEqual(speakersOf(r), ["참석자 1:2", "참석자 2:2"]);
  const saved = parseTranscript(text, "A", r.confirm.defaults);
  assert.equal(saved.ok, true);
  assert.equal(describeNotes(saved.notes).includes("머리말 3줄 제외"), true);
  assert.equal(JSON.stringify(saved).includes("구독 서비스"), false);
});

test("시:분:초와 분:초를 모두 알아본다", () => {
  const text = body("제목", "날짜", "이름", "", "참석자 1 59:58", "가", "", "참석자 2 1:00:01", "나", "", "참석자 1 1:02:03", "다", "", "참석자 2 1:05:09", "라");
  const r = parseTranscript(text);
  assert.deepEqual(speakersOf(r), ["참석자 1:2", "참석자 2:2"]);
});

test("본문의 '내일 3:30'이나 '결론: …'은 화자 줄이 아니라 발언의 일부다", () => {
  const text = body("제목", "날짜", "이름", "", turns, "", "참석자 1 01:00", "내일 3:30", "결론: 이렇게 해요", "", "참석자 2 01:10", "네.");
  const r = parseTranscript(text);
  assert.deepEqual(speakersOf(r), ["참석자 1:3", "참석자 2:3"]);
  const saved = parseTranscript(text, "A", r.confirm.defaults);
  assert.equal(saved.utterances[4].text, "내일 3:30 결론: 이렇게 해요"); // 원문 글자는 줄 사이 공백 한 칸만 바뀐다
});

test("'진행자:' 처럼 역할이 적힌 줄이 있으면 클로바 모드를 쓰지 않는다(다른 형식으로 읽는다)", () => {
  const r = parseTranscript(body("진행자: 안녕하세요", "참가자: 네", "참석자 1 00:01", "말", "참석자 1 00:02", "말"));
  assert.deepEqual(speakersOf(r), ["진행자:1", "참가자:1", "참석자 1:2"]);
});

test("진행자를 둘 이상 고를 수 있고, 진행자로 고른 발언은 moderator로 저장된다", () => {
  const text = body("제목", "날짜", "이름", "", turns, "", "참석자 3 01:02", "메모 남길게요.");
  const first = parseTranscript(text);
  const r = parseTranscript(text, "A", { 참석자1: M, 참석자2: P, 참석자3: M });
  assert.equal(first.ok, false);
  assert.equal(r.ok, true);
  assert.deepEqual(r.utterances.map((u) => u.role), [M, P, M, P, M]);
});
