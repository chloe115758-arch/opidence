import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { byName, runBatch } from "./batch.ts";
import { parseForSave, parseTranscript } from "./transcript.ts";

const dir = (d) => (name) => ({ name, text: fs.readFileSync(new URL(`../data/${d}/${name}`, import.meta.url), "utf8") });
const t = dir("test");
const iv = dir("interviews");
const tests = fs.readdirSync(new URL("../data/test/", import.meta.url)).filter((n) => n.endsWith(".txt")).sort();
const at = (from, to) => tests.filter((n) => n >= from && n < to + "~").map(t);
const plain = (name, text) => ({ name, text }); // 파일 없이 글만 넘길 때 // 파일 번호 범위(예: "01"~"09")

// DB와 서버를 흉내 내는 가짜 저장소: 라벨이 없는 파일에는 비어 있는 다음 글자를 붙이고(parseForSave),
// 같은 라벨은 "이미 있어요", 10건을 넘으면 "10건까지". existing은 이미 올라가 있는 라벨들.
function fakeDb(existing = []) {
  const labels = new Set(existing);
  const db = {
    calls: 0,
    labels,
    save: async (text, roles) => {
      db.calls++;
      const p = parseForSave(text, labels, roles);
      if (!p.ok) return { problems: p.problems };
      if (labels.has(p.label)) return { problems: [{ message: `참가자 ${p.label} 전사본이 이미 있어요. 목록에서 먼저 지운 뒤 다시 올려 주세요.` }] };
      if (labels.size >= 10) return { problems: [{ message: "전사본은 10건까지 올릴 수 있어요." }] };
      labels.add(p.label);
      return { problems: [], label: p.label };
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
  msg("01_빈파일.txt", "파일이 비어 있어요");
  msg("02_공백만.txt", "파일이 비어 있어요");
  msg("03_제한초과.txt", "10,000자(녹음 약 35분)까지");
  msg("04_가짜연락처.txt", "주민등록번호·전화번호처럼 보이는 내용이 있어요");
  msg("05_화자형식오류.txt", "화자는 '진행자' 또는 '참가자 A'로");
  msg("06_번호건너뜀.txt", "A-02 순서예요");
  msg("07_참가자발언없음.txt", "참가자 발언이 없어요");
  assert.equal(db.calls, 2, "형식이 틀린 파일은 서버(저장소)에 보내지 않는다");
});

test("샘플 8건이 있으면 남은 자리는 2: 9개를 고르면 아무것도 저장하지 않는다", async () => {
  const db = fakeDb([..."ABCDEFGH"]);
  const r = await run(at("01", "09"), 2, db);
  assert.match(r.rejected, /^2건만 더 올릴 수 있어요\./);
  assert.match(r.rejected, /7개를 빼고/);
  assert.equal(db.calls, 0);
  assert.equal(db.labels.size, 8);
});

test("남은 자리가 0이면 한 파일도 올리지 않는다", async () => {
  const db = fakeDb([..."ABCDEFGHQR"]);
  const r = await run([t("11_정상_라벨S.txt")], 0, db);
  assert.match(r.rejected, /^더 올릴 자리가 없어요/);
  assert.equal(db.calls, 0);
});

test("남은 자리보다 많으면(파일 11개, 자리 10) 거부한다", async () => {
  const db = fakeDb();
  const r = await run(tests.slice(0, 11).map(t), 10, db);
  assert.match(r.rejected, /^10건만 더 올릴 수 있어요/);
  assert.equal(db.calls, 0);
});

test("같은 참가자 파일 두 개: 첫 번째만 저장하고 두 번째는 서버에 보내지 않고 알려 준다", async () => {
  const db = fakeDb();
  const r = await run([t("10_정상_라벨R.txt"), t("12_중복_라벨R.txt")], 10, db);
  assert.equal(r.summary, "1건 저장, 1건 실패");
  assert.equal(r.items[0].status, "saved");
  assert.match(failedText(r.items, "12_중복_라벨R.txt"), /참가자 R 전사본이 이미 있어요/);
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
  assert.match(failedText(r.items, "interview_A.txt"), /이미 있어요/);
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
    return { problems: [] };
  };
  const r = await runBatch([t("10_정상_라벨R.txt"), t("11_정상_라벨S.txt")], 10, { parse: parseTranscript, save });
  assert.equal(r.summary, "1건 저장, 1건 실패");
  assert.match(failedText(r.items, "10_정상_라벨R.txt"), /인터넷 연결을 확인하고 이 파일만 다시 올려 주세요/);
});

test("화면이 읽지 못했거나 txt가 아니라고 알린 파일은 그 이유로 실패한다", async () => {
  const db = fakeDb();
  const r = await run([{ name: "사진.png", text: "", error: "txt 파일만 올릴 수 있습니다." }, t("10_정상_라벨R.txt")], 10, db);
  assert.equal(r.summary, "1건 저장, 1건 실패");
  assert.equal(failedText(r.items, "사진.png"), "txt 파일만 올릴 수 있습니다.");
  assert.equal(db.calls, 1);
});

// ───────────── 자동 정리와 라벨 자동 부여 ─────────────

test("라벨이 없는 파일은 서버가 비어 있는 다음 글자를 붙이고, 저장한 파일은 그 라벨과 정리 내용을 돌려준다", async () => {
  const db = fakeDb([..."ABCDEFGH"]);
  const r = await run([t("13_번호없음.txt"), t("14_QA형식.txt")], 2, db);
  assert.equal(r.summary, "2건 저장");
  assert.deepEqual(r.items.map((x) => [x.name, x.status, x.label]), [["13_번호없음.txt", "saved", "I"], ["14_QA형식.txt", "saved", "J"]]);
  assert.equal(r.items[0].notes.numbersAdded, true);
  assert.deepEqual([...db.labels].sort(), [..."ABCDEFGHIJ"]);
});

test("라벨 자동 부여는 중간에 비어 있는 글자부터 쓴다", async () => {
  const db = fakeDb(["A", "C"]);
  const r = await run([t("13_번호없음.txt")], 5, db);
  assert.equal(r.items[0].label, "B");
});

test("번호 없는 파일 둘은 서로 다른 라벨로 저장되고 같은 참가자로 취급하지 않는다", async () => {
  const r = await run([t("13_번호없음.txt"), t("21_화자한명.txt")], 10, fakeDb());
  assert.equal(r.summary, "2건 저장");
  assert.deepEqual(r.items.map((x) => x.label), ["A", "B"]);
});

test("라벨이 자동으로 붙은 뒤 같은 묶음의 라벨 명시 파일이 그 글자를 쓰려 하면 이유와 고치는 방법을 알려 준다", async () => {
  // 번호 없는 파일이 A를 가져간 뒤, 머리말이 '참가자 A'인 번호 없는 형식 파일
  const headerA = plain("머리말A.txt", "참가자 A | 가상\n\n진행자: 질문\n참가자: 답변\n");
  const db = fakeDb();
  const r = await run([t("13_번호없음.txt"), headerA], 10, db);
  assert.equal(r.summary, "1건 저장, 1건 실패");
  assert.equal(failedText(r.items, "머리말A.txt"), "같은 묶음의 다른 파일에 참가자 A 라벨이 자동으로 붙었어요. 이 파일의 머리말을 지우면 다른 글자로 저장돼요.");
  assert.equal(db.calls, 1, "서버에 보내지 않고 바로 알린다");

  // 번호 형식 파일(발언 번호에 라벨이 들어 있다)은 머리말만 지워서는 해결되지 않는다는 점까지 알려 준다
  const r2 = await run([t("13_번호없음.txt"), t("08_여러줄발언.txt")], 10, fakeDb());
  assert.match(failedText(r2.items, "08_여러줄발언.txt"), /^같은 묶음의 다른 파일에 참가자 A 라벨이 자동으로 붙었어요\. 이 파일은 번호가 A-01…로 정해져 있어 저장하지 못했어요/);
});

test("라벨 명시 파일이 먼저면 번호 없는 파일은 다른 글자를 받는다", async () => {
  const r = await run([t("08_여러줄발언.txt"), t("13_번호없음.txt")], 10, fakeDb());
  assert.equal(r.summary, "2건 저장");
  assert.deepEqual(r.items.map((x) => x.label), ["A", "B"]);
});

test("파일 이름 순으로 정렬한다(숫자는 크기 순)", () => {
  const names = ["10_정상.txt", "02_빈.txt", "01_가.txt", "9_나.txt"].map((name) => ({ name })).sort(byName).map((x) => x.name);
  assert.deepEqual(names, ["01_가.txt", "02_빈.txt", "9_나.txt", "10_정상.txt"]);
});

test("정렬해서 넘기면 실패 카드가 01 → 08 순서로 나온다", async () => {
  const reversed = at("01", "08").reverse(); // 브라우저가 거꾸로 준 순서
  const r = await run(reversed.sort(byName), 10, fakeDb());
  assert.deepEqual(r.items.filter((x) => x.status === "failed").map((x) => x.name.slice(0, 2)), ["01", "02", "03", "04", "05", "06", "07"]);
});

test("가득 찬 자리에서는 라벨 자동 부여 파일도 막는다", async () => {
  const r = await run([t("13_번호없음.txt")], 0, fakeDb());
  assert.match(r.rejected, /^더 올릴 자리가 없어요/);
});

test("라벨 A~Z를 모두 쓰고 있으면 번호 없는 파일은 이유와 함께 실패한다", async () => {
  const r = await run([t("13_번호없음.txt")], 1, fakeDb([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]));
  assert.match(failedText(r.items, "13_번호없음.txt"), /참가자 라벨 A~Z를 모두 쓰고 있어요/);
});

// ───────── 화자 확인 (6-7): 역할이 적힌 파일을 먼저 저장하고, 확인이 필요한 파일만 차례로 묻는다 ─────────
const withRoles = (parse = (raw, roles) => parseTranscript(raw, "A", roles)) => ({ parse });
const clova = () => t("24_클로바노트형식.txt");
const firstOf = (name) => { const r = parseTranscript(t(name).text); assert.ok(r.confirm, `${name}은 화자 확인 대상이어야 한다`); return r.confirm; };

test("역할이 적힌 파일을 먼저 저장하고, 확인이 필요한 파일은 이름 순으로 차례로 묻는다", async () => {
  const db = fakeDb();
  const asked = [];
  const r = await run([t("10_정상_라벨R.txt"), t("19_구분불가.txt"), clova()].sort(byName), 10, db, {
    ...withRoles(),
    askRoles: async (a) => {
      asked.push([a.name, a.position, a.total, a.savedSoFar, db.calls]);
      return a.confirm.defaults;
    },
  });
  assert.deepEqual(asked, [["19_구분불가.txt", 1, 2, 1, 1], ["24_클로바노트형식.txt", 2, 2, 2, 2]]); // 묻는 동안 서버 호출은 먼저 저장한 만큼뿐
  assert.equal(r.summary, "3건 저장");
  assert.deepEqual(r.items.map((x) => [x.name, x.label]), [["10_정상_라벨R.txt", "R"], ["19_구분불가.txt", "A"], ["24_클로바노트형식.txt", "B"]]);
  assert.equal(r.items[2].notes.confirmed, true);
});

test("건너뛰기를 고르면 그 파일은 저장하지 않고 서버에 보내지 않는다", async () => {
  const db = fakeDb();
  const r = await run([t("10_정상_라벨R.txt"), t("19_구분불가.txt"), clova()], 10, db, { ...withRoles(), askRoles: async (a) => (a.name.startsWith("19") ? null : a.confirm.defaults) });
  assert.equal(r.summary, "2건 저장, 1건 건너뜀");
  assert.deepEqual(r.items.filter((x) => x.status === "skipped").map((x) => x.name), ["19_구분불가.txt"]);
  assert.equal(db.calls, 2);
  assert.deepEqual([...db.labels], ["R", "A"]);
});

test("모두 건너뛰면 저장이 없고, 요약에 실패는 쓰지 않는다", async () => {
  const db = fakeDb();
  const r = await run([clova()], 10, db, { ...withRoles(), askRoles: async () => null });
  assert.equal(r.summary, "0건 저장, 1건 건너뜀");
  assert.equal(db.calls, 0);
});

test("묻는 화면이 없으면(askRoles 없음) 예전처럼 이유와 함께 실패한다", async () => {
  const db = fakeDb();
  const r = await run([t("19_구분불가.txt")], 10, db, withRoles());
  assert.match(failedText(r.items, "19_구분불가.txt"), /진행자와 참가자를 구분할 수 없어요/);
  assert.equal(db.calls, 0);
});

test("규칙에 어긋난 역할이 돌아오면 서버에 보내지 않고 이유와 함께 실패한다(1:1 인터뷰만)", async () => {
  const db = fakeDb();
  const roles = { 참석자1: "participant", 참석자2: "participant", 참석자3: "participant" };
  const r = await run([clova()], 10, db, { ...withRoles(), askRoles: async () => roles });
  assert.match(failedText(r.items, "24_클로바노트형식.txt"), /1:1 인터뷰만 올릴 수 있어요/);
  assert.equal(db.calls, 0);
});

test("자리는 고른 파일 수로 센다: 건너뛸 파일도 자리를 쓰므로 모자라면 묻기 전에 거부한다", async () => {
  const db = fakeDb(["A", "B", "C", "D", "E", "F", "G", "H"]);
  let asked = 0;
  const r = await run([clova(), t("19_구분불가.txt"), t("10_정상_라벨R.txt")], 2, db, { ...withRoles(), askRoles: async () => { asked++; return null; } });
  assert.match(r.rejected, /^2건만 더 올릴 수 있어요\./);
  assert.equal(asked, 0);
});

test("확인 대상 파일의 화자 정보: 화자마다 발언 수와 첫 발언", () => {
  const c = firstOf("19_구분불가.txt");
  assert.deepEqual(c.speakers.map((s) => [s.token, s.count, s.first]), [["김테스트", 2, "앱은 언제 쓰세요?"], ["이테스트", 2, "출퇴근길에 써요."]]);
});
