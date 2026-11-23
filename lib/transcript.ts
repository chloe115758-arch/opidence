// 전사본 파일을 발언 단위로 나누고, 저장하기 전에 형식과 개인정보를 검사한다.
// 브라우저(올리기 전)와 서버(저장 전)에서 같은 함수를 쓴다. 문제가 있으면 추측해서 고치지 않고 멈춘다.
import type { Utterance } from "./types";

export const MAX_CHARS = 10000;

export type Problem = { line?: number; message: string };
export type Parsed =
  | { ok: true; label: string; meta: string; charCount: number; utterances: Utterance[] }
  | { ok: false; problems: Problem[] };

const HEADER = /^참가자 ([A-Z])(?: \||$)/;
const LINE = /^([A-Z])-(\d+) (진행자|참가자 ([A-Z])): (.+)$/;
const LOOKS_LIKE_ID = /^[A-Z]-\d+\s/;

// 실명은 형태로 잡을 수 없다. 업로드 화면에서 직접 확인하라고 안내한다.
const PII: [name: string, pattern: RegExp][] = [
  ["이메일", /[\w.+-]+@[\w-]+\.[\w.-]+/],
  ["주민등록번호", /\d{6}[- ]?[1-4]\d{6}/],
  ["전화번호", /0\d{1,2}[-. ]?\d{3,4}[-. ]?\d{4}/],
];

export function parseTranscript(raw: string): Parsed {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return fail([{ message: "파일이 비어 있습니다. 전사본 내용을 넣은 뒤 다시 올려 주세요." }]);
  if (text.length > MAX_CHARS)
    return fail([
      {
        message: `파일당 ${MAX_CHARS.toLocaleString()}자까지 올릴 수 있습니다(현재 ${text.length.toLocaleString()}자). 내용을 줄이거나 나누어 올려 주세요.`,
      },
    ]);

  const problems: Problem[] = [];
  const utterances: Utterance[] = [];
  let label = "";
  let meta = "";

  text.split("\n").forEach((rawLine, i) => {
    const line = rawLine.trim();
    const n = i + 1;
    if (!line) return;

    // 한 줄이 여러 형태에 걸려도(예: 000000-1000000은 주민등록번호와 전화번호 형태) 안내는 한 줄에 하나로 합친다.
    const found = PII.filter(([, pattern]) => pattern.test(line)).map(([name]) => name).join("·");
    if (found) problems.push({ line: n, message: `${found} 형태가 있습니다. 지우거나 '(${found})'처럼 바꾼 뒤 다시 올려 주세요.` });

    const m = LINE.exec(line);
    if (!m) {
      if (LOOKS_LIKE_ID.test(line))
        problems.push({ line: n, message: "화자는 '진행자' 또는 '참가자 A'처럼 쓰고, 뒤에 ': '와 발언을 붙여 주세요. 예: A-02 참가자 A: 네, 자주 써요." });
      else if (utterances.length === 0 && !label && HEADER.test(line)) {
        label = HEADER.exec(line)![1];
        meta = line.replace(/^참가자 [A-Z]\s*\|?\s*/, "");
      } else if (utterances.length > 0 || label)
        problems.push({ line: n, message: "모든 발언은 'A-01 진행자: 질문'처럼 발언 ID로 시작해야 합니다. 여러 줄에 걸친 발언은 한 줄로 합쳐 주세요." });
      // 헤더 앞의 안내 줄(예: [가상 인터뷰 데이터 …])은 저장하지 않고 넘어간다
      return;
    }

    const [, prefix, , speaker, speakerLabel, sentence] = m;
    const id = line.slice(0, line.indexOf(" "));
    if (!label) {
      problems.push({ line: n, message: "첫 발언 앞에 '참가자 A | 설명'처럼 참가자 라벨 줄을 넣어 주세요." });
      label = prefix; // 같은 안내를 줄마다 반복하지 않는다
    }
    const expected = `${label}-${String(utterances.length + 1).padStart(2, "0")}`;
    if (id !== expected)
      problems.push({ line: n, message: `발언 ID는 ${label}-01부터 순서대로, 참가자 라벨과 같은 글자로 써 주세요. 이 줄은 ${expected}이어야 합니다(현재 ${id}).` });
    if (speakerLabel && speakerLabel !== label)
      problems.push({ line: n, message: `화자를 '참가자 ${label}'로 써 주세요(현재 '${speaker}'). 한 파일에는 참가자 한 명만 넣습니다.` });

    utterances.push({
      id,
      label,
      seq: utterances.length + 1,
      role: speaker === "진행자" ? "moderator" : "participant",
      text: sentence.trim(),
    });
  });

  if (problems.length === 0 && !utterances.some((u) => u.role === "participant"))
    problems.push({ message: "참가자 발언이 없습니다. 'A-02 참가자 A: 발언'처럼 참가자 발언을 넣어 주세요." });

  return problems.length ? fail(problems) : { ok: true, label, meta, charCount: text.length, utterances };
}

const fail = (problems: Problem[]): Parsed => ({ ok: false, problems });
