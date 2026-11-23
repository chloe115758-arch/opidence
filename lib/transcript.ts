// 전사본 파일을 발언 단위로 나누고, 저장하기 전에 형식과 개인정보를 검사한다.
// 브라우저(올리기 전)와 서버(저장 전)에서 같은 함수를 쓴다. 문제가 있으면 추측해서 고치지 않고 멈춘다.
//
// 두 가지 형식을 읽는다. AI는 쓰지 않고 규칙만 쓴다.
// 1) 번호 형식: 'A-01 진행자: 질문' 줄이 하나라도 있으면 지금까지처럼 엄격하게 읽는다(번호가 틀리면 오류).
// 2) 그 밖의 형식: 발언 번호를 직접 적지 않아도 된다. 화자 표기(진행자:, Q:, 참가자:, 이름: …)를 알아보고 번호를 순서대로 붙인다.
// 자동 정리는 줄 합치기(공백 1칸), 시간 표시 지우기, 앞뒤 공백 정리, 머리말 제외, 번호 붙이기뿐이다. 발언의 원문 글자는 바꾸지 않는다.
// 무엇을 정리했는지는 notes에 담아 화면이 한 줄로 알려 준다.
import type { Utterance } from "./types";

export const MAX_CHARS = 10000;
// 사용자당 전사본 수. 실제 제한은 DB 트리거(transcripts_limit)가 건다. 이 값은 화면이 올리기 전에 안내하려고 쓴다.
export const MAX_TRANSCRIPTS = 10;

export type Problem = { line?: number; message: string };

// 자동 정리한 내용. 아무것도 정리하지 않았으면(번호가 이미 있는 정상 파일) describeNotes가 빈 문자열을 돌려준다.
export type Notes = {
  numbersAdded: boolean; // 발언 번호를 새로 붙였다
  speakers: boolean; // '진행자'·'참가자' 말고 다른 화자 표기(Q, A, 인터뷰어, 이름 …)를 역할로 바꿨다
  times: number; // 지운 시간 표시 수
  joined: number; // 화자 없는 줄을 앞 발언에 이어 붙인 곳(발언) 수
  preamble: number; // 첫 발언 앞에서 저장하지 않은 머리말 줄 수
};

export type Parsed =
  | {
      ok: true;
      label: string;
      autoLabel: boolean; // 파일에 라벨이 없어 호출한 쪽이 준 글자를 썼다(저장할 때 서버가 비어 있는 글자로 다시 정한다)
      meta: string;
      charCount: number;
      utterances: Utterance[];
      notes: Notes;
    }
  | { ok: false; problems: Problem[] };

const HEADER = /^참가자 ([A-Z])(?: \||$)/;
const HEADER_WITH_META = /^참가자 ([A-Z]) \|/; // 번호 없는 형식에서는 '참가자 A'만 있는 줄이 화자 줄일 수 있어 메타가 있는 줄만 머리말로 본다
const LINE = /^([A-Z])-(\d+) (진행자|참가자 ([A-Z])): (.+)$/;
const LOOKS_LIKE_ID = /^[A-Z]-\d+\s/;
const NUMBERED_START = /^[A-Z]-\d{2,}\s/; // 이런 줄이 하나라도 있으면 번호 형식으로 읽는다

// 실명은 형태로 잡을 수 없다. 업로드 화면에서 직접 확인하라고 안내한다.
const PII: [name: string, pattern: RegExp][] = [
  ["이메일", /[\w.+-]+@[\w-]+\.[\w.-]+/],
  ["주민등록번호", /\d{6}[- ]?[1-4]\d{6}/],
  ["전화번호", /0\d{1,2}[-. ]?\d{3,4}[-. ]?\d{4}/],
];

// ───────────── 시간 표시 ─────────────
// 줄 전체가 시간이거나, 줄 맨 앞(대괄호 또는 시:분:초)이거나, 화자 표기 바로 뒤일 때만 지운다. 발언 안의 "3:30에"는 그대로 둔다.
const T = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?`;
const TIME_ONLY = new RegExp(String.raw`^[\[(]?${T}[\])]?(?:\s*(?:-->|[-–~])\s*[\[(]?${T}[\])]?)?$`);
const STRONG_LEAD = new RegExp(String.raw`^(?:[\[(]${T}[\])]|\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)(?=\s|$)\s*`); // [00:01:23] 또는 00:01:23
const WEAK_LEAD = new RegExp(String.raw`^${T}(?=\s)\s*`); // 01:23 (뒤가 화자 표기일 때만 시간으로 본다)
const TRAILING_TIME = new RegExp(String.raw`\s+[\[(]?${T}[\])]?$`);

function stripLead(line: string, restIsSpeaker: (rest: string) => boolean): { rest: string; n: number } {
  const strong = STRONG_LEAD.exec(line);
  if (strong) return { rest: line.slice(strong[0].length), n: 1 };
  const weak = WEAK_LEAD.exec(line);
  if (weak && restIsSpeaker(line.slice(weak[0].length))) return { rest: line.slice(weak[0].length), n: 1 };
  return { rest: line, n: 0 };
}

// ───────────── 화자 표기 ─────────────
type Kind = "moderator" | "participant" | "other";
const MOD = /^(진행자|인터뷰어|모더레이터|사회자|질문자|interviewer|moderator|host)[0-9a-z]?$/;
const PART = /^(참가자|응답자|답변자|인터뷰이|사용자|유저|participant|respondent|interviewee|user)[0-9a-z]?$/;
const keyOf = (token: string) => token.toLowerCase().replace(/\s+/g, "");
const kindOf = (token: string): Kind => {
  const k = keyOf(token);
  if (k === "q" || MOD.test(k)) return "moderator";
  if (k === "a" || PART.test(k)) return "participant";
  return "other";
};

const COLON = /^([^\s:：][^:：]{0,19}?)\s*[:：](?!\d)\s*(.*)$/; // 진행자: 글 (콜론 뒤에 숫자가 바로 오는 3:30은 제외)
const DOT = /^([QqAa])\s*[.)]\s+(.+)$/; // Q. 글, A) 글
const BRACKET = /^[[(<]\s*([^\])>]{1,20}?)\s*[\])>]\s*(.*)$/; // [진행자] 글 (알려진 표기만)
const ARROW = /^([^\s>]{1,20})>\s*(.*)$/; // 진행자> 글 (알려진 표기만)

// 줄이 화자 줄이면 화자 표기와 그 뒤의 글을 돌려준다. 표기는 20자 이하, 두 단어 이하이고 글자를 포함해야 한다.
function speakerOf(line: string): { token: string; rest: string; times: number } | null {
  const plausible = (token: string, rest: string) =>
    /[A-Za-z가-힣]/.test(token) && token.trim().split(/\s+/).length <= 2 && !/^https?$/i.test(token.trim()) && !rest.startsWith("//");
  let m = COLON.exec(line);
  if (m && plausible(m[1], m[2])) return { token: m[1].trim(), rest: m[2], times: 0 };
  m = DOT.exec(line);
  if (m) return { token: m[1], rest: m[2], times: 0 };
  m = BRACKET.exec(line) ?? ARROW.exec(line);
  if (m && kindOf(m[1].trim()) !== "other") return { token: m[1].trim(), rest: m[2], times: 0 };
  // 참가자 1  00:01:23 처럼 화자와 시간만 있는 줄: 글은 다음 줄부터 이어진다
  const t = TRAILING_TIME.exec(line);
  if (t) {
    const token = line.slice(0, t.index).trim();
    if (plausible(token, "")) return { token, rest: "", times: 1 };
  }
  return null;
}

type Draft = { line: number; text: string; role?: Utterance["role"]; speaker?: string };

export function parseTranscript(raw: string, autoLabel = "A"): Parsed {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return fail([{ message: "파일이 비어 있습니다. 전사본 내용을 넣은 뒤 다시 올려 주세요." }]);
  if (text.length > MAX_CHARS)
    return fail([
      {
        message: `파일당 ${MAX_CHARS.toLocaleString()}자까지 올릴 수 있습니다(현재 ${text.length.toLocaleString()}자). 내용을 줄이거나 나누어 올려 주세요.`,
      },
    ]);

  const lines = text.split("\n");
  const numbered = lines.some((l) => NUMBERED_START.test(l.trim()));
  const problems: Problem[] = [];
  const drafts: Draft[] = [];
  const joined = new Set<Draft>();
  const speakers = new Map<string, { token: string; kind: Kind; count: number }>();
  const notes: Notes = { numbersAdded: !numbered, speakers: false, times: 0, joined: 0, preamble: 0 };
  let label = "";
  let meta = "";
  let noticeSkipped = false;

  lines.forEach((rawLine, i) => {
    let line = rawLine.trim();
    const n = i + 1;
    if (!line) return;

    // 개인정보 검사는 원본 줄에 한다. 한 줄이 여러 형태에 걸려도(예: 000000-1000000은 주민등록번호와 전화번호 형태) 안내는 한 줄에 하나로 합친다.
    const found = PII.filter(([, pattern]) => pattern.test(line)).map(([name]) => name).join("·");
    if (found) problems.push({ line: n, message: `${found} 형태가 있습니다. 지우거나 '(${found})'처럼 바꾼 뒤 다시 올려 주세요.` });

    if (TIME_ONLY.test(line)) {
      notes.times++;
      return;
    }
    const lead = stripLead(line, numbered ? (rest) => LINE.test(rest) : (rest) => speakerOf(rest) !== null);
    notes.times += lead.n;
    line = lead.rest;

    const continueLast = () => {
      const last = drafts[drafts.length - 1];
      last.text = last.text ? `${last.text} ${line}` : line;
      joined.add(last);
    };

    // ── 번호 형식: 지금까지의 규칙 그대로. 화자 없는 줄은 앞 발언에 잇는다. ──
    if (numbered) {
      const m = LINE.exec(line);
      if (!m) {
        if (LOOKS_LIKE_ID.test(line))
          problems.push({ line: n, message: "화자는 '진행자' 또는 '참가자 A'처럼 쓰고, 뒤에 ': '와 발언을 붙여 주세요. 예: A-02 참가자 A: 네, 자주 써요." });
        else if (drafts.length === 0 && !label && HEADER.test(line)) {
          label = HEADER.exec(line)![1];
          meta = line.replace(/^참가자 [A-Z]\s*\|?\s*/, "");
        } else if (drafts.length === 0) {
          // 이 서비스의 가상 데이터 첫 줄([가상 인터뷰 데이터 …])은 형식의 일부라 알리지 않고 넘어간다. 그 밖의 머리말은 제외했다고 알린다.
          if (!noticeSkipped && !label && /^\[.*\]$/.test(line)) noticeSkipped = true;
          else notes.preamble++;
        } else if (kindOf(speakerOf(line)?.token ?? "") !== "other")
          problems.push({ line: n, message: "번호가 있는 줄과 없는 줄이 섞여 있습니다. 모든 발언에 'A-01 진행자: 질문'처럼 번호를 붙이거나, 번호를 모두 지워 주세요." });
        else continueLast();
        return;
      }

      const [, prefix, , speaker, speakerLabel, sentence] = m;
      const id = line.slice(0, line.indexOf(" "));
      if (!label) {
        problems.push({ line: n, message: "첫 발언 앞에 '참가자 A | 설명'처럼 참가자 라벨 줄을 넣어 주세요." });
        label = prefix; // 같은 안내를 줄마다 반복하지 않는다
      }
      const expected = `${label}-${String(drafts.length + 1).padStart(2, "0")}`;
      if (id !== expected)
        problems.push({ line: n, message: `발언 ID는 ${label}-01부터 순서대로, 참가자 라벨과 같은 글자로 써 주세요. 이 줄은 ${expected}이어야 합니다(현재 ${id}).` });
      if (speakerLabel && speakerLabel !== label)
        problems.push({ line: n, message: `화자를 '참가자 ${label}'로 써 주세요(현재 '${speaker}'). 한 파일에는 참가자 한 명만 넣습니다.` });
      drafts.push({ line: n, text: sentence.trim(), role: speaker === "진행자" ? "moderator" : "participant" });
      return;
    }

    // ── 번호 없는 형식: 화자 표기를 알아보고 번호는 나중에 순서대로 붙인다. ──
    const header = drafts.length === 0 && !label ? HEADER_WITH_META.exec(line) : null;
    if (header) {
      label = header[1];
      meta = line.replace(/^참가자 [A-Z]\s*\|?\s*/, "");
      return;
    }
    const sp = speakerOf(line);
    if (sp) {
      const key = keyOf(sp.token);
      const seen = speakers.get(key);
      if (seen) seen.count++;
      else speakers.set(key, { token: sp.token, kind: kindOf(sp.token), count: 1 });
      notes.times += sp.times;
      drafts.push({ line: n, text: sp.rest.trim(), speaker: key });
    } else if (drafts.length === 0) notes.preamble++;
    else continueLast();
  });

  notes.joined = joined.size;

  if (!numbered) {
    const list = [...speakers.values()];
    const shown = list.map((s) => `'${s.token}' ${s.count}줄`).join(", ");
    if (list.length === 0)
      problems.push({
        message: "화자 표기를 찾지 못했습니다. 각 발언 줄 맨 앞에 '진행자: 질문', '참가자: 답변'처럼 화자와 ':'를 써 주세요. (번호를 직접 붙인다면 'A-01 진행자: 질문' 형식입니다.)",
      });
    else if (list.length >= 3)
      problems.push({
        message: `화자 표기가 ${list.length}개로 읽혔습니다(${shown}). 진행자 1명과 참가자 1명이 나눈 인터뷰만 올릴 수 있습니다. 발언 안의 ':' 때문에 화자로 읽힌 표기가 있으면 그 줄을 고쳐 주세요.`,
      });
    else {
      const mods = list.filter((s) => s.kind === "moderator").length;
      if (mods === list.length)
        problems.push({ message: `참가자로 읽을 화자가 없습니다(읽은 표기: ${shown}). 참가자 발언 줄에는 '참가자:'나 '응답자:'를 써 주세요.` });
      else if (list.length === 2 ? mods === 0 : list[0].kind === "other")
        problems.push({
          message: `진행자와 참가자를 구분할 수 없습니다(읽은 표기: ${shown}). 진행자는 '진행자' 또는 '인터뷰어'로, 참가자는 '참가자' 또는 '응답자'로 바꿔 주세요.`,
        });
    }
    if (problems.length === 0) {
      // 진행자 표기가 아닌 나머지 한 사람(참가자 표기, Q/A의 A, 이름 등)이 참가자다. 표기 자체(이름 등)는 저장하지 않는다.
      for (const d of drafts) d.role = speakers.get(d.speaker!)!.kind === "moderator" ? "moderator" : "participant";
      notes.speakers = list.some((s) => s.token !== "진행자" && s.token !== "참가자");
      for (const d of drafts) if (!d.text) problems.push({ line: d.line, message: "화자 표기만 있고 발언 내용이 없습니다. 발언을 쓰거나 이 줄을 지워 주세요." });
    }
  }

  if (problems.length === 0 && !drafts.some((d) => d.role === "participant"))
    problems.push({ message: "참가자 발언이 없습니다. 'A-02 참가자 A: 발언'처럼 참가자 발언을 넣어 주세요." });
  if (problems.length) return fail(problems);

  const autoLabeled = !label;
  const finalLabel = label || autoLabel;
  const utterances: Utterance[] = drafts.map((d, i) => ({
    id: `${finalLabel}-${String(i + 1).padStart(2, "0")}`,
    label: finalLabel,
    seq: i + 1,
    role: d.role!,
    text: d.text,
  }));
  return { ok: true, label: finalLabel, autoLabel: autoLabeled, meta, charCount: text.length, utterances, notes };
}

// 저장 직전에 부른다: 파일에 라벨이 없으면 이미 올라간 라벨(used) 중 비어 있는 다음 글자를 붙여 다시 읽는다.
export function parseForSave(raw: string, used: Iterable<string>): Parsed {
  const first = parseTranscript(raw);
  if (!first.ok || !first.autoLabel) return first;
  const label = nextFreeLabel(used);
  if (!label) return fail([{ message: "참가자 라벨 A~Z를 모두 쓰고 있습니다. 목록에서 쓰지 않는 전사본을 지운 뒤 다시 올려 주세요." }]);
  return parseTranscript(raw, label);
}

// 비어 있는 다음 글자(A부터). 26자를 모두 쓰고 있으면 null.
export function nextFreeLabel(used: Iterable<string>): string | null {
  const taken = new Set(used);
  return [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].find((l) => !taken.has(l)) ?? null;
}

// 결과 카드에 보여 줄 한 줄. 정리한 것이 없으면 빈 문자열이다. 빈 줄을 지운 것은 알리지 않는다.
export function describeNotes(n: Notes): string {
  const parts = [
    n.numbersAdded && "번호 붙임",
    n.speakers && "화자 표기 정리",
    n.times > 0 && `시간 표시 ${n.times}개 지움`,
    n.joined > 0 && `여러 줄 ${n.joined}곳 합침`,
    n.preamble > 0 && `머리말 ${n.preamble}줄 제외`,
  ].filter(Boolean);
  return parts.length ? `자동 정리됨: ${parts.join(", ")}` : "";
}

const fail = (problems: Problem[]): Parsed => ({ ok: false, problems });
