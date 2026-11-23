import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseTranscript } from "./transcript.ts";

// data/test의 방어용 가상 파일. 파일마다 기대하는 안내 문구(일부)를 적는다. 새 파일을 넣으면 여기에도 적어야 테스트가 통과한다.
const blocked = {
  "01_빈파일.txt": ["파일이 비어 있습니다"],
  "02_공백만.txt": ["파일이 비어 있습니다"],
  "03_제한초과.txt": ["파일당 10,000자까지 올릴 수 있습니다"],
  "04_가짜연락처.txt": ["전화번호 형태", "이메일 형태", "주민등록번호·전화번호 형태가 있습니다"],
  "05_화자형식오류.txt": ["화자는 '진행자' 또는 '참가자 A'처럼", "화자를 '참가자 A'로"],
  "06_번호건너뜀.txt": ["A-02이어야 합니다"],
  "07_참가자발언없음.txt": ["참가자 발언이 없습니다"],
  "08_여러줄발언.txt": ["발언 ID로 시작해야 합니다"],
};
const accepted = ["09_긴텍스트.txt", "10_정상_라벨R.txt", "11_정상_라벨S.txt"];
const read = (name) => fs.readFileSync(new URL(`../data/test/${name}`, import.meta.url), "utf8");

for (const [name, expected] of Object.entries(blocked))
  test(`data/test/${name}: 막히고 고치는 방법을 알려 준다`, () => {
    const r = parseTranscript(read(name));
    assert.equal(r.ok, false, "막혀야 하는데 통과했다");
    const text = r.problems.map((p) => p.message).join("\n");
    for (const part of expected) assert.ok(text.includes(part), `"${part}" 안내가 없다:\n${text}`);
  });

test("data/test/09_긴텍스트.txt: 정상 파일로 통과한다(공백 없는 긴 글 포함)", () => {
  const r = parseTranscript(read(accepted[0]));
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

test("data/test/10·11: 짧은 정상 파일(라벨 R, S)로 통과한다", () => {
  for (const [name, label] of [["10_정상_라벨R.txt", "R"], ["11_정상_라벨S.txt", "S"]]) {
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
  assert.deepEqual(files, [...Object.keys(blocked), ...accepted].sort());
});
