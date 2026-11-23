import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// 화면에 보이는 문구는 해요체로 통일한다(CLAUDE.md). 소스에 합쇼체 종결(~습니다·입니다·합니다·됩니다·드립니다)이 남으면 실패한다.
// 검사하지 않는 것: 주석, 개발자에게만 보이는 오류(throw new Error), 서버 기록(console.error), 테스트 파일,
// 개발용 가짜 응답(lib/ai/fixture.ts, MOCK_AI), 프롬프트 파일(prompts/*.md).
const ROOT = new URL("../", import.meta.url).pathname;
const DIRS = ["app", "components", "lib"];
const SKIP_FILES = new Set(["lib/ai/fixture.ts"]);
const FORMAL = /(습니다|입니다|합니다|됩니다|드립니다)/;

const walk = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return walk(rel);
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
  });

// 블록 주석(/* */, {/* */})은 줄 수를 지키면서 비우고, 줄 주석은 "//" 앞이 공백이거나 줄 처음일 때만 뗀다(문자열 안의 https:// 는 건드리지 않는다).
export function visibleLines(source) {
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock.split("\n").map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"));
}

export function formalIn(rel) {
  const found = [];
  visibleLines(fs.readFileSync(path.join(ROOT, rel), "utf8")).forEach((line, i) => {
    if (/throw new Error\(|console\.error\(/.test(line)) return;
    if (FORMAL.test(line)) found.push(`${rel}:${i + 1}: ${line.trim()}`);
  });
  return found;
}

test("화면 문구에 합쇼체 종결이 남아 있지 않다", () => {
  const files = DIRS.flatMap(walk).filter((f) => !SKIP_FILES.has(f));
  assert.ok(files.length > 20, "검사할 파일을 찾지 못했다");
  const found = files.flatMap(formalIn);
  assert.deepEqual(found, [], `해요체로 고쳐 주세요:\n${found.join("\n")}`);
});

test("검사기 자체: 주석·throw·console은 건너뛰고 문구는 잡는다", () => {
  const lines = visibleLines('const a = "저장합니다"; // 주석입니다\n/* 블록입니다\n여기도입니다 */\nconst b = "https://x.com 이에요";');
  assert.equal(lines.length, 4);
  assert.ok(FORMAL.test(lines[0]), "문구는 잡힌다");
  assert.ok(!FORMAL.test(lines[0].replace(/"저장합니다"/, "")), "줄 주석은 떼어진다");
  assert.ok(!FORMAL.test(lines[1] + lines[2]), "블록 주석은 비워진다");
  assert.ok(lines[3].includes("https://x.com"), "문자열 안의 URL은 그대로 둔다");
});
