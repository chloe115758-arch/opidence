import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { describeNotes, parseTranscript } from "./transcript.ts";

// data/test의 방어용 가상 파일. 파일마다 기대하는 안내 문구(일부)를 적는다. 새 파일을 넣으면 여기에도 적어야 테스트가 통과한다.
const blocked = {
  "01_빈파일.txt": ["파일이 비어 있어요"],
  "02_공백만.txt": ["파일이 비어 있어요"],
  "03_제한초과.txt": ["지금은 한 파일에 10,000자(녹음 약 35분)까지 올릴 수 있어요"],
  "04_가짜연락처.txt": ["전화번호처럼 보이는", "이메일처럼 보이는", "주민등록번호·전화번호처럼 보이는 내용이 있어요"],
  "05_화자형식오류.txt": ["화자는 '진행자' 또는 '참가자 A'로", "화자를 '참가자 A'로"],
  "06_번호건너뜀.txt": ["A-02 순서예요"],
  "07_참가자발언없음.txt": ["참가자 발언이 없어요"],
  // 18·19는 화자 확인을 거치면 저장할 수 있다. 확인 없이 보내면(roles 없이) 예전 안내로 막힌다.
  "18_화자3명.txt": ["3개로 읽혔어요"],
  "19_구분불가.txt": ["진행자와 참가자를 구분할 수 없어요"],
  "20_번호섞임.txt": ["번호가 있는 줄과 없는 줄이 섞여 있어요"],
  "22_번호없음_연락처.txt": ["전화번호처럼 보이는 내용이 있어요"],
};
const accepted = [
  "08_여러줄발언.txt", "09_긴텍스트.txt", "10_정상_라벨R.txt", "11_정상_라벨S.txt", "12_중복_라벨R.txt",
  "13_번호없음.txt", "14_QA형식.txt", "15_시간표시.txt", "16_여러줄합침.txt", "17_이름화자.txt", "21_화자한명.txt", "23_머리말.txt",
];
// 화자 확인이 필요한 파일. 24는 확인 없이 보내면 막히지만 18·19와 같은 길이다.
const confirmOnly = ["24_클로바노트형식.txt"];
const read = (name) => fs.readFileSync(new URL(`../data/test/${name}`, import.meta.url), "utf8");

for (const [name, expected] of Object.entries(blocked))
  test(`data/test/${name}: 막히고 고치는 방법을 알려 준다`, () => {
    const r = parseTranscript(read(name));
    assert.equal(r.ok, false, "막혀야 하는데 통과했다");
    const text = r.problems.map((p) => p.message).join("\n");
    for (const part of expected) assert.ok(text.includes(part), `"${part}" 안내가 없다:\n${text}`);
  });

test("data/test/09_긴텍스트.txt: 정상 파일로 통과한다(공백 없는 긴 글 포함)", () => {
  const r = parseTranscript(read("09_긴텍스트.txt"));
  assert.equal(r.ok, true, r.ok ? "" : r.problems.map((p) => p.message).join("\n"));
  assert.equal(r.label, "Q");
  assert.ok(r.utterances.some((u) => u.text.length > 150 && !/\s/.test(u.text.split(": ").pop().slice(0, 150))));
});

test("data/test/04: 한 줄에 안내는 하나만 나온다", () => {
  const r = parseTranscript(read("04_가짜연락처.txt"));
  assert.equal(r.ok, false);
  const lines = r.problems.map((p) => p.line);
  assert.deepEqual(lines, [...new Set(lines)]);
  assert.equal(lines.length, 3);
});

test("data/test/10·11·12: 짧은 정상 파일(라벨 R, S, R)로 통과한다", () => {
  for (const [name, label] of [["10_정상_라벨R.txt", "R"], ["11_정상_라벨S.txt", "S"], ["12_중복_라벨R.txt", "R"]]) {
    const r = parseTranscript(read(name));
    assert.equal(r.ok, true, r.ok ? "" : r.problems.map((p) => p.message).join("\n"));
    assert.equal(r.label, label);
  }
});

test("가짜 연락처 파일은 누가 봐도 가짜인 값만 쓴다", () => {
  const text = read("04_가짜연락처.txt");
  const phones = text.match(/0\d{1,2}-\d{3,4}-\d{4}/g) ?? [];
  assert.deepEqual(phones, ["010-0000-0000"]);
  assert.deepEqual(text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g), ["test@example.com"]);
  assert.deepEqual(text.match(/\d{6}-[1-4]\d{6}/g), ["000000-1000000"]);
});

test("data/test의 모든 txt 파일에 기대 결과가 적혀 있다", () => {
  const files = fs.readdirSync(new URL("../data/test/", import.meta.url)).filter((n) => n.endsWith(".txt")).sort();
  assert.deepEqual(files, [...Object.keys(blocked), ...accepted, ...confirmOnly].sort());
});

// 저장되는 파일이 자동 정리로 어떻게 읽히는지: 정리 문구, 화자 역할, (정리한 파일은) 발언 글자.
const M = "moderator";
const P = "participant";
const cleaned = {
  "08_여러줄발언.txt": { notes: "자동 정리됨: 여러 줄 1곳 합침", roles: [M, P], text: [null, "첫 줄에서 말을 시작했는데 줄을 바꿔서 이어 썼어요."] },
  "09_긴텍스트.txt": { notes: "" },
  "10_정상_라벨R.txt": { notes: "" },
  "11_정상_라벨S.txt": { notes: "" },
  "12_중복_라벨R.txt": { notes: "" },
  "13_번호없음.txt": { notes: "자동 정리됨: 번호 붙임", roles: [M, P, M, P] },
  "14_QA형식.txt": { notes: "자동 정리됨: 번호 붙임, 화자 표기 정리", roles: [M, P, M, P] },
  "15_시간표시.txt": {
    notes: "자동 정리됨: 번호 붙임, 시간 표시 4개 지움, 여러 줄 1곳 합침",
    roles: [M, P, M, P],
    text: ["앱은 언제 쓰세요?", "저는 오후 3:30에 퇴근해서 자주 써요.", "불편한 점은요?", "시간표는 12:03 정도에 확인해요."], // 발언 안의 시각은 그대로
  },
  "16_여러줄합침.txt": {
    notes: "자동 정리됨: 번호 붙임, 여러 줄 2곳 합침",
    roles: [M, P, M, P],
    text: [
      null,
      "처음에는 자전거를 찾기가 어려웠어요. 지도에서 위치는 보이는데 실제로는 없는 경우도 있었어요. 그래서 몇 번 헛걸음을 했어요.",
      null,
      "다른 정거장으로 갔어요. 거기서도 없으면 포기했어요.",
    ],
  },
  "17_이름화자.txt": { notes: "자동 정리됨: 번호 붙임, 화자 표기 정리", roles: [M, P, M, P] },
  "21_화자한명.txt": { notes: "자동 정리됨: 번호 붙임", roles: [P, P] },
  "23_머리말.txt": { notes: "자동 정리됨: 번호 붙임, 머리말 2줄 제외", roles: [M, P] },
};

for (const [name, want] of Object.entries(cleaned))
  test(`data/test/${name}: 저장되고 정리 문구가 맞다`, () => {
    const r = parseTranscript(read(name), "A");
    assert.equal(r.ok, true, r.ok ? "" : r.problems.map((p) => p.message).join("\n"));
    assert.equal(describeNotes(r.notes), want.notes);
    if (want.roles) assert.deepEqual(r.utterances.map((u) => u.role), want.roles);
    want.text?.forEach((t, i) => t !== null && assert.equal(r.utterances[i].text, t));
  });

test("data/test/17: 이름 화자 표기는 저장 내용에 남지 않는다", () => {
  assert.equal(JSON.stringify(parseTranscript(read("17_이름화자.txt"), "A")).includes("김테스트"), false);
});

test("data/test/13: 머리말 라벨이 없으면 호출한 쪽이 준 라벨로 번호를 붙인다", () => {
  const r = parseTranscript(read("13_번호없음.txt"), "I");
  assert.equal(r.ok && r.autoLabel, true);
  assert.deepEqual(r.utterances.map((u) => u.id), ["I-01", "I-02", "I-03", "I-04"]);
});

test("막히는 파일의 안내는 모두 해요체다(합쇼체 종결이 섞이지 않는다)", () => {
  for (const name of Object.keys(blocked)) {
    const r = parseTranscript(read(name));
    assert.equal(r.ok, false);
    for (const p of r.problems) assert.doesNotMatch(p.message, /(습니다|입니다|합니다|됩니다)/, `${name}: ${p.message}`);
  }
});

// ───────── 화자 확인 (6-7) ─────────
const summary = (r) => r.confirm.speakers.map((s) => `${s.token}:${s.count}`);

test("data/test/18·19: 화자 확인으로 풀 수 있다(기본 역할과 화자 목록)", () => {
  const a = parseTranscript(read("18_화자3명.txt"));
  assert.equal(a.ok, false);
  assert.deepEqual(summary(a), ["진행자:2", "참가자:1", "김테스트:1"]);
  assert.deepEqual(Object.values(a.confirm.defaults), [M, P, P]); // 표기가 알려 주는 역할은 그대로, 모르는 표기는 참가자
  const b = parseTranscript(read("19_구분불가.txt"));
  assert.deepEqual(summary(b), ["김테스트:2", "이테스트:2"]);
  assert.deepEqual(Object.values(b.confirm.defaults), [M, P]); // 모두 1~2줄이면 처음 말한 화자가 진행자
});

test("data/test/24: 클로바 머리말 3줄은 화자도 저장 내용도 아니다", () => {
  const r = parseTranscript(read("24_클로바노트형식.txt"));
  assert.equal(r.ok, false);
  assert.deepEqual(summary(r), ["참석자 1:3", "참석자 2:3", "참석자 3:1"]);
  assert.deepEqual(Object.values(r.confirm.defaults), [M, P, P]);
  assert.equal(r.confirm.speakers[0].first, "안녕하세요. 오늘은 자전거 대여 앱을 쓰면서 겪은 이야기를 듣고 싶어요. 편하게 말씀해 주세요."); // 여러 줄 발언은 한 줄로
  assert.equal(r.confirm.speakers[2].first, "네.");
});

test("data/test/24: 역할을 고르면 저장할 수 있고 정리 문구가 맞다", () => {
  const first = parseTranscript(read("24_클로바노트형식.txt"));
  const r = parseTranscript(read("24_클로바노트형식.txt"), "A", first.confirm.defaults);
  assert.equal(r.ok, true, r.ok ? "" : r.problems.map((p) => p.message).join("\n"));
  assert.deepEqual(r.utterances.map((u) => u.role), [M, P, M, P, P, M, P]);
  assert.deepEqual(r.utterances.map((u) => u.id), ["A-01", "A-02", "A-03", "A-04", "A-05", "A-06", "A-07"]);
  assert.equal(describeNotes(r.notes), "자동 정리됨: 번호 붙임, 화자 표기 정리, 화자 역할 직접 고름, 시간 표시 7개 지움, 여러 줄 2곳 합침, 머리말 3줄 제외");
  const all = JSON.stringify(r);
  for (const gone of ["김테스트", "테스트용", "참석자", "오후 3:20"]) assert.equal(all.includes(gone), false, `${gone}이(가) 저장 내용에 남았다`);
  assert.equal(r.utterances[1].text, "네, 출퇴근길에 일주일에 서너 번 써요. 3:30쯤 퇴근하면 앱부터 열어요."); // 발언 안의 시각은 그대로
});

test("data/test/24: 규칙에 어긋난 역할은 저장하지 않는다(서버도 같은 검사)", () => {
  const msg = (roles) => { const r = parseTranscript(read("24_클로바노트형식.txt"), "A", roles); return r.ok ? "" : r.problems.map((p) => p.message).join("\n"); };
  assert.match(msg({ 참석자1: P, 참석자2: P, 참석자3: P }), /1:1 인터뷰만 올릴 수 있어요.*참석자 1, 참석자 2/);
  assert.match(msg({ 참석자1: M, 참석자2: M, 참석자3: M }), /참가자를 한 명 이상/);
  assert.match(msg({ 참석자1: M, 참석자2: P }), /화자마다/); // 하나 빠짐
  assert.equal(msg({ 참석자1: M, 참석자2: P, 참석자3: M }), ""); // 1줄 화자를 진행자로 고르면 근거에서만 빠진다
  assert.equal(msg({ 참석자1: P, 참석자2: M, 참석자3: P }), ""); // 우회는 막지 않는다(결정 9). 화면 요약 줄이 대가를 보여 준다
});

test("화자 확인이 필요 없는 파일에 roles를 보내도 결과가 같다", () => {
  const roles = { 진행자: P, 참가자: M };
  assert.deepEqual(parseTranscript(read("17_이름화자.txt"), "A", roles), parseTranscript(read("17_이름화자.txt"), "A"));
});
