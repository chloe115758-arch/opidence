import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runBatch } from "./batch.ts";
import { parseTranscript } from "./transcript.ts";

const dir = (d) => (name) => ({ name, text: fs.readFileSync(new URL(`../data/${d}/${name}`, import.meta.url), "utf8") });
const t = dir("test");
const iv = dir("interviews");
const tests = fs.readdirSync(new URL("../data/test/", import.meta.url)).filter((n) => n.endsWith(".txt")).sort();
const at = (from, to) => tests.filter((n) => n >= from && n < to + "~").map(t); // 파일 번호 범위(예: "01"~"09")

// DB를 흉내 내는 가짜 저장소: 같은 라벨은 "이미 있습니다", 10건을 넘으면 "10건까지". existing은 이미 올라가 있는 라벨들.
function fakeDb(existing = []) {
  const labels = new Set(existing);
  const db = {
    calls: 0,
    labels,
    save: async (text) => {
      db.calls++;
      const p = parseTranscript(text);
      if (!p.ok) return p.problems;
      if (labels.has(p.label)) return [{ message: `참가자 ${p.label} 전사본이 이미 있습니다. 목록에서 먼저 지운 뒤 다시 올려 주세요.` }];
      if (labels.size >= 10) return [{ message: "전사본은 10건까지 올릴 수 있습니다." }];
      labels.add(p.label);
      return [];
    },
  };
  return db;
}
const run = (inputs, remaining, db, extra = {}) => runBatch(inputs, remaining, { parse: parseTranscript, save: db.save, ...extra });
const failedText = (items, name) => {
  const it = items.find((x) => x.name === name);
  assert.equal(it?.status, "failed", `${name}이 실패로 나와야 한다`);
  return it.problems.map((p) => p.message).join("\n");
};

test("빈 작업 공간에서 data/test 01~09를 한 번에: 2건 저장, 7건 실패", async () => {
  const db = fakeDb();
  const r = await run(at("01", "09"), 10, db);
  assert.equal(r.rejected, null);
  assert.equal(r.summary, "2건 저장, 7건 실패");
  // 08(여러 줄 발언)은 자동 정리로 저장되고, 09(참가자 Q)도 저장된다
  assert.deepEqual(r.items.filter((x) => x.status === "saved").map((x) => [x.name, x.label]), [["08_여러줄발언.txt", "A"], ["09_긴텍스트.txt", "Q"]]);
  assert.deepEqual([...db.labels], ["A", "Q"]);
  const msg = (name, part) => assert.ok(failedText(r.items, name).includes(part), `${name}: "${part}" 안내가 없다`);
  msg("01_빈파일.txt", "파일이 비어 있습니다");
  msg("02_공백만.txt", "파일이 비어 있습니다");
  msg("03_제한초과.txt", "10,000자까지");
  msg("04_가짜연락처.txt", "주민등록번호·전화번호 형태가 있습니다");
  msg("05_화자형식오류.txt", "화자는 '진행자' 또는 '참가자 A'처럼");
  msg("06_번호건너뜀.txt", "A-02이어야 합니다");
  msg("07_참가자발언없음.txt", "참가자 발언이 없습니다");
  assert.equal(db.calls, 2, "형식이 틀린 파일은 서버(저장소)에 보내지 않는다");
});

test("샘플 8건이 있으면 남은 자리는 2: 9개를 고르면 아무것도 저장하지 않는다", async () => {
  const db = fakeDb([..."ABCDEFGH"]);
  const r = await run(at("01", "09"), 2, db);
  assert.match(r.rejected, /^2건만 더 올릴 수 있습니다\./);
  assert.match(r.rejected, /7개를 빼고/);
  assert.equal(db.calls, 0);
  assert.equal(db.labels.size, 8);
});

test("남은 자리가 0이면 한 파일도 올리지 않는다", async () => {
  const db = fakeDb([..."ABCDEFGHQR"]);
  const r = await run([t("11_정상_라벨S.txt")], 0, db);
  assert.match(r.rejected, /^더 올릴 자리가 없습니다/);
  assert.equal(db.calls, 0);
});

test("남은 자리보다 많으면(파일 11개, 자리 10) 거부한다", async () => {
  const db = fakeDb();
  const r = await run(tests.slice(0, 11).map(t), 10, db);
  assert.match(r.rejected, /^10건만 더 올릴 수 있습니다/);
  assert.equal(db.calls, 0);
});

test("같은 참가자 파일 두 개: 첫 번째만 저장하고 두 번째는 서버에 보내지 않고 알려 준다", async () => {
  const db = fakeDb();
  const r = await run([t("10_정상_라벨R.txt"), t("12_중복_라벨R.txt")], 10, db);
  assert.equal(r.summary, "1건 저장, 1건 실패");
  assert.equal(r.items[0].status, "saved");
  assert.match(failedText(r.items, "12_중복_라벨R.txt"), /참가자 R 전사본이 이미 있습니다/);
  assert.equal(db.calls, 1);
});

test("첫 번째 파일이 실패하면 같은 참가자의 두 번째 파일은 저장된다", async () => {
  const broken = { name: "깨진R.txt", text: "참가자 R | 가상\n\nR-02 참가자 R: 번호가 틀렸어요.\n" };
  const r = await run([broken, t("10_정상_라벨R.txt")], 10, fakeDb());
  assert.equal(r.summary, "1건 저장, 1건 실패");
  assert.equal(r.items[0].status, "failed");
  assert.equal(r.items[1].status, "saved");
});

test("이미 올라가 있는 참가자 파일은 저장소가 알려 준다", async () => {
  const db = fakeDb([..."ABCDEFGH"]);
  const r = await run([iv("interview_A.txt")], 2, db);
  assert.equal(r.summary, "0건 저장, 1건 실패");
  assert.match(failedText(r.items, "interview_A.txt"), /이미 있습니다/);
});

test("정상 파일 셋은 모두 저장되고, 실패가 없으면 요약에 실패를 쓰지 않는다", async () => {
  const db = fakeDb();
  const r = await run(["09_긴텍스트.txt", "10_정상_라벨R.txt", "11_정상_라벨S.txt"].map(t), 10, db);
  assert.equal(r.summary, "3건 저장");
  assert.deepEqual([...db.labels], ["Q", "R", "S"]);
});

test("샘플 인터뷰 8건도 한 번에 저장된다", async () => {
  const r = await run("ABCDEFGH".split("").map((l) => iv(`interview_${l}.txt`)), 10, fakeDb());
  assert.equal(r.summary, "8건 저장");
});

test("진행 상황: 저장을 시작할 때마다 '몇 번째/전체, 파일 이름'을 알린다", async () => {
  const seen = [];
  await run(["09_긴텍스트.txt", "10_정상_라벨R.txt", "11_정상_라벨S.txt"].map(t), 10, fakeDb(), { onProgress: (c, n, name) => seen.push([c, n, name]) });
  assert.deepEqual(seen, [[1, 3, "09_긴텍스트.txt"], [2, 3, "10_정상_라벨R.txt"], [3, 3, "11_정상_라벨S.txt"]]);
});

test("연결이 끊겨 저장이 예외를 던지면 그 파일만 실패하고 다음 파일로 이어간다", async () => {
  let n = 0;
  const save = async () => {
    if (++n === 1) throw new Error("network");
    return [];
  };
  const r = await runBatch([t("10_정상_라벨R.txt"), t("11_정상_라벨S.txt")], 10, { parse: parseTranscript, save });
  assert.equal(r.summary, "1건 저장, 1건 실패");
  assert.match(failedText(r.items, "10_정상_라벨R.txt"), /인터넷 연결을 확인한 뒤 이 파일만 다시 올려 주세요/);
});

test("화면이 읽지 못했거나 txt가 아니라고 알린 파일은 그 이유로 실패한다", async () => {
  const db = fakeDb();
  const r = await run([{ name: "사진.png", text: "", error: "txt 파일만 올릴 수 있습니다." }, t("10_정상_라벨R.txt")], 10, db);
  assert.equal(r.summary, "1건 저장, 1건 실패");
  assert.equal(failedText(r.items, "사진.png"), "txt 파일만 올릴 수 있습니다.");
  assert.equal(db.calls, 1);
});
