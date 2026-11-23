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
  assert.match(messages(""), /비어 있어요/);
  assert.match(messages(" \n\n"), /비어 있어요/);
  assert.match(messages(good + "A-03 진행자: " + "가".repeat(10000)), /10,000자까지/);
});

test("형식 오류: 줄 번호와 고치는 방법을 알려 준다", () => {
  assert.match(messages(good.replace("A-02 참가자 A:", "A-02 김민수:")), /^5:화자는 '진행자' 또는 '참가자 A'로/);
  assert.match(messages(good.replace("A-02", "A-03")), /^5:.*이 줄은 A-02 순서예요\(지금 A-03\)/);
  assert.match(messages(good.replace("A-02", "A-2")), /^5:.*A-02 순서예요/);
  assert.match(messages(good.replace("A-02 참가자 A", "A-02 참가자 B")), /^5:화자를 '참가자 A'로/);
  assert.match(messages(good.replace("A-01", "B-01")), /^4:.*A-01 순서예요/);
  assert.match(messages(good.replace("참가자 A | 20대 후반 | 직장인\n", "")), /^3:.*참가자 라벨 줄을/);
  assert.match(messages("참가자 A | 설명\nA-01 진행자: 질문만 있어요?\n"), /참가자 발언이 없어요/);
});

test("개인정보 형태가 있으면 막는다 (예시는 모두 가짜 값)", () => {
  assert.match(messages(good + "A-03 진행자: 010-0000-0000으로 연락드릴게요.\n"), /^6:전화번호처럼 보이는 내용이 있어요/);
  assert.match(messages(good + "A-03 진행자: 02 000 0000 맞으시죠?\n"), /^6:전화번호처럼 보이는 내용이 있어요/);
  assert.match(messages(good + "A-03 진행자: test@example.com 맞으시죠?\n"), /^6:이메일처럼 보이는 내용이 있어요/);
  // 한 줄이 두 형태에 걸리면 안내는 한 줄에 하나로 합쳐진다
  const both = messages(good + "A-03 진행자: 000000-1000000 확인했습니다.\n");
  assert.match(both, /^6:주민등록번호·전화번호처럼 보이는 내용이 있어요/);
  assert.equal(both.split("\n").length, 1);
});

// ───────────── 번호 없는 형식과 자동 정리 ─────────────
import { describeNotes, nextFreeLabel } from "./transcript.ts";

const ok = (raw, label) => {
  const r = parseTranscript(raw, label);
  assert.equal(r.ok, true, r.ok ? "" : r.problems.map((p) => `${p.line ?? "-"}:${p.message}`).join("\n"));
  return r;
};
const rows = (r) => r.utterances.map((u) => [u.id, u.role, u.text]);

test("번호 형식: 화자 없는 줄은 앞 발언에 한 칸 띄워 잇고, 번호처럼 보이는데 틀린 줄은 계속 오류", () => {
  const r = ok(good + "줄이 바뀐 발언\n");
  assert.equal(r.utterances[1].text, "출퇴근할 때요. 걸으면 15분인데요. 줄이 바뀐 발언");
  assert.equal(describeNotes(r.notes), "자동 정리됨: 여러 줄 1곳 합침");
  assert.match(messages(good + "A-03 참가자 A 번호만 있고 콜론이 없어요\n"), /^6:화자는 '진행자' 또는 '참가자 A'로/);
  assert.match(messages(good + "참가자: 번호 없이 쓴 줄\n"), /^6:번호가 있는 줄과 없는 줄이 섞여 있어요/);
});

test("번호 형식에서는 정리할 것이 없으면 정리 문구가 없다(샘플 8건 모두)", () => {
  for (const l of "ABCDEFGH") {
    const r = ok(fs.readFileSync(`data/interviews/interview_${l}.txt`, "utf8"));
    assert.equal(describeNotes(r.notes), "", `interview_${l}`);
    assert.equal(r.autoLabel, false);
  }
});

test("번호 없는 형식: 번호를 순서대로 붙이고 진행자·참가자를 알아본다", () => {
  const r = ok("진행자: 언제 쓰세요?\n참가자: 출퇴근할 때요.\n", "C");
  assert.deepEqual(rows(r), [["C-01", "moderator", "언제 쓰세요?"], ["C-02", "participant", "출퇴근할 때요."]]);
  assert.equal(r.label, "C");
  assert.equal(r.autoLabel, true);
  assert.equal(describeNotes(r.notes), "자동 정리됨: 번호 붙임");
});

test("번호 없는 형식이어도 머리말에 라벨이 있으면 그 라벨을 쓴다", () => {
  const r = ok("참가자 D | 20대\n\n진행자: 질문\n참가자: 답변\n", "A");
  assert.equal(r.label, "D");
  assert.equal(r.autoLabel, false);
  assert.equal(r.meta, "20대");
});

test("화자 표기 변형을 알아본다", () => {
  const cases = [
    ["Q: 질문\nA: 답변\n", "Q·A"],
    ["Q. 질문\nA. 답변\n", "Q.·A."],
    ["Q) 질문\nA) 답변\n", "Q)·A)"],
    ["[진행자] 질문\n[참가자] 답변\n", "대괄호"],
    ["진행자> 질문\n참가자> 답변\n", "화살표"],
    ["진행자 : 질문\n참가자 : 답변\n", "공백 콜론"],
    ["진행자： 질문\n참가자： 답변\n", "전각 콜론"],
    ["Interviewer: 질문\nRespondent: 답변\n", "영문"],
    ["모더레이터: 질문\n응답자: 답변\n", "모더레이터·응답자"],
    ["사회자: 질문\n참가자 1: 답변\n", "참가자 1"],
    ["인터뷰어: 질문\n김테스트: 답변\n", "이름"],
  ];
  for (const [raw, name] of cases) assert.deepEqual(rows(ok(raw, "A")).map((x) => x[1]), ["moderator", "participant"], name);
});

test("시간 표시는 줄 앞·줄 전체·화자 뒤에서만 지우고 발언 안의 시각은 그대로 둔다", () => {
  const r = ok("[00:01:23] 진행자: 언제 쓰세요?\n00:01:30\n참가자 00:01:35\n오후 3:30에 퇴근해요.\n01:40 진행자: 그다음은요?\n참가자: 12:03 정도예요.\n", "A");
  assert.deepEqual(rows(r), [
    ["A-01", "moderator", "언제 쓰세요?"],
    ["A-02", "participant", "오후 3:30에 퇴근해요."],
    ["A-03", "moderator", "그다음은요?"],
    ["A-04", "participant", "12:03 정도예요."],
  ]);
  assert.equal(r.notes.times, 4);
});

test("화자 없는 줄은 앞 발언에 잇고 빈 줄은 지운다. 원문 글자는 줄 사이 공백 한 칸 말고 바뀌지 않는다", () => {
  const r = ok("진행자: 질문이에요.\n\n참가자:   첫 줄  \n  둘째 줄\n\n셋째 줄\n", "A");
  assert.deepEqual(rows(r), [["A-01", "moderator", "질문이에요."], ["A-02", "participant", "첫 줄 둘째 줄 셋째 줄"]]);
  assert.equal(describeNotes(r.notes), "자동 정리됨: 번호 붙임, 여러 줄 1곳 합침");
});

test("첫 발언 앞의 머리말은 저장하지 않고 몇 줄 제외했는지 알린다", () => {
  const r = ok("가상 인터뷰 기록\n2024년\n진행자: 질문\n참가자: 답변\n", "A");
  assert.equal(r.utterances.length, 2);
  assert.equal(describeNotes(r.notes), "자동 정리됨: 번호 붙임, 머리말 2줄 제외");
});

test("이름 같은 화자 표기는 역할로만 저장하고 표기는 남기지 않는다", () => {
  const r = ok("인터뷰어: 질문\n김테스트: 답변\n", "A");
  assert.equal(JSON.stringify(r).includes("김테스트"), false);
  assert.equal(describeNotes(r.notes), "자동 정리됨: 번호 붙임, 화자 표기 정리");
});

test("진행자 없이 참가자 표기만 있으면 저장한다. 이름만 있는 한 명은 막는다", () => {
  assert.deepEqual(ok("참가자: 가\n참가자: 나\n", "A").utterances.map((u) => u.role), ["participant", "participant"]);
  assert.deepEqual(ok("응답자: 가\n", "A").utterances.map((u) => u.role), ["participant"]);
  assert.match(messages("김테스트: 가\n김테스트: 나\n"), /진행자와 참가자를 구분할 수 없어요.*'김테스트' 2줄/);
  assert.match(messages("진행자: 질문만 있어요\n"), /참가자로 읽을 화자가 없어요/);
});

test("화자가 3개 이상이거나 진행자를 알 수 없으면 저장하지 않고 이유를 알려 준다", () => {
  assert.match(messages("진행자: 가\n참가자: 나\n김테스트: 다\n"), /3개로 읽혔어요\('진행자' 1줄, '참가자' 1줄, '김테스트' 1줄\)/);
  assert.match(messages("김테스트: 가\n이테스트: 나\n"), /진행자와 참가자를 구분할 수 없어요/);
  assert.match(messages("참가자: 가\n김테스트: 나\n"), /진행자와 참가자를 구분할 수 없어요/);
  assert.match(messages("진행자: 가\n인터뷰어: 나\n"), /참가자로 읽을 화자가 없어요/);
  assert.match(messages("화자 표기가 전혀 없는 글입니다\n그냥 이어지는 글\n"), /화자 표기를 찾지 못했어요/);
});

test("본문에 콜론이 있는 줄은 화자로 읽지 않거나(시각·긴 문장), 읽었다면 이유와 함께 막는다", () => {
  const r = ok("진행자: 질문\n참가자: 답변\n그래서 제가 말씀드리면 이런 점이 있습니다: 좋아요\n주소는 http://example.com 입니다\n", "A");
  assert.equal(r.utterances[1].text, "답변 그래서 제가 말씀드리면 이런 점이 있습니다: 좋아요 주소는 http://example.com 입니다");
  assert.match(messages("진행자: 질문\n참가자: 답변\n결론: 좋아요\n"), /3개로 읽혔어요.*'결론' 1줄/);
});

test("화자 표기만 있고 내용이 없는 발언은 막는다", () => {
  assert.match(messages("진행자: 질문\n참가자:\n진행자: 또 질문\n참가자: 답\n"), /^2:화자만 있고 발언 내용이 없어요/);
});

test("번호 없는 형식에서도 개인정보 검사는 그대로 한다(줄 번호는 원본 기준)", () => {
  assert.match(messages("진행자: 질문\n\n참가자: 010-0000-0000 이에요\n"), /^3:전화번호처럼 보이는 내용이 있어요/);
  assert.match(messages("[00:01:23] 참가자: test@example.com\n진행자: 네\n"), /^1:이메일처럼 보이는 내용이 있어요/);
});

test("비어 있는 다음 라벨 글자", () => {
  assert.equal(nextFreeLabel([]), "A");
  assert.equal(nextFreeLabel(["A", "B", "C"]), "D");
  assert.equal(nextFreeLabel([..."ABCDEFGH"]), "I");
  assert.equal(nextFreeLabel(["A", "C"]), "B"); // 중간이 비면 그 글자
  assert.equal(nextFreeLabel([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]), null);
});

test("정리 문구 만들기", () => {
  const none = { numbersAdded: false, speakers: false, times: 0, joined: 0, preamble: 0 };
  assert.equal(describeNotes(none), "");
  assert.equal(
    describeNotes({ numbersAdded: true, speakers: false, times: 12, joined: 3, preamble: 0 }),
    "자동 정리됨: 번호 붙임, 시간 표시 12개 지움, 여러 줄 3곳 합침",
  );
});
