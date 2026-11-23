// 전사본 파일 여러 개를 한 번에 올리는 규칙. 화면(components/Upload.tsx)과 테스트가 함께 쓴다.
// 파싱과 저장은 함수로 받는다: 화면은 parseTranscript와 서버 액션 upload를, 테스트는 가짜 저장소를 넘긴다.
import type { Roles } from "./speakers.ts";
import type { Confirm, Notes, Parsed, Problem } from "./transcript";

// text는 화면이 파일에서 읽은 글이다. 읽지 못했거나 txt가 아니면 error에 이유를 담아 보낸다(그 파일은 실패로 표시한다).
export type BatchInput = { name: string; text: string; error?: string };

// notes는 자동 정리한 내용이다(화면이 describeNotes로 한 줄로 보여 준다).
export type BatchItem =
  | { name: string; status: "saved"; label: string; utterances: number; notes: Notes }
  | { name: string; status: "failed"; problems: Problem[] }
  | { name: string; status: "skipped" }; // 화자 확인에서 사용자가 "건너뛰기"를 골랐다(아무것도 저장하지 않았다)

// rejected가 문자열이면 아무것도 저장하지 않았다는 뜻이다(고른 파일이 남은 자리보다 많다).
export type BatchResult = { rejected: string } | { rejected: null; items: BatchItem[]; summary: string };

// 저장 결과. problems가 비어 있으면 저장됨이고, label은 서버가 저장한 참가자 라벨이다(파일에 라벨이 없으면 서버가 정한다).
export type SaveResult = { problems: Problem[]; label?: string };

// 화자 확인을 물을 때 화면에 넘기는 값. position은 확인이 필요한 파일 중 몇 번째인지(1부터)다.
export type AskRoles = { name: string; confirm: Confirm; position: number; total: number; savedSoFar: number };

type Deps = {
  parse: (raw: string, roles?: Roles) => Parsed;
  save: (text: string, roles?: Roles) => Promise<SaveResult>;
  // 역할을 알 수 없는 파일의 역할을 사용자에게 묻는다. 역할을 돌려주면 그 역할로 저장하고, null이면 그 파일만 건너뛴다. 없으면 그런 파일은 예전처럼 실패로 알린다.
  askRoles?: (ask: AskRoles) => Promise<Roles | null>;
  onProgress?: (current: number, total: number, name: string) => void; // 저장을 시작할 때마다. current는 1부터
};

// 파일 이름 순(숫자는 크기 순: 2 < 10). 화면이 고른 파일을 이 순서로 정렬해서 넘긴다. 결과 카드도 같은 순서로 나온다.
export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ko", { numeric: true });

// 고른 파일 수로 센다(실패할 파일도 포함). 남은 자리보다 많으면 아무것도 올리지 않는다.
// 정상 파일은 저장하고 나머지는 이름·이유와 함께 실패로 돌려준다. 파일은 넘겨받은 순서대로 한 개씩 저장한다.
export async function runBatch(inputs: BatchInput[], remaining: number, { parse, save, askRoles, onProgress }: Deps): Promise<BatchResult> {
  const n = inputs.length;
  if (n > remaining)
    return {
      rejected:
        remaining <= 0
          ? "더 올릴 자리가 없어요. 목록에서 쓰지 않는 전사본을 지우고 다시 올려 주세요. 아무것도 올리지 않았어요."
          : `${remaining}건만 더 올릴 수 있어요. 파일을 ${n}개 골랐으니 ${n - remaining}개를 빼고 다시 골라 주세요. 아무것도 올리지 않았어요.`,
    };

  const items: BatchItem[] = [];
  const savedLabels = new Set<string>(); // 이 묶음에서 저장한 라벨
  const autoLabels = new Set<string>(); // 그중 파일에 라벨이 없어 서버가 자동으로 붙인 라벨
  const fail = (name: string, ...problems: Problem[]) => items.push({ name, status: "failed", problems });

  // 한 파일을 저장한다(roles는 화자 확인에서 고른 역할). 실패는 items에 이유와 함께 남긴다.
  const saveOne = async (name: string, text: string, parsed: Extract<Parsed, { ok: true }>, roles?: Roles) => {
    // 라벨이 적힌 파일이 같은 묶음에서 이미 저장한 라벨과 겹치면 서버에 보내지 않고 바로 알린다. 라벨이 없는 파일은 서버가 빈 글자를 붙이니 겹치지 않는다.
    if (!parsed.autoLabel && savedLabels.has(parsed.label)) {
      fail(name, { message: conflict(parsed, autoLabels.has(parsed.label)) });
      return;
    }
    let result: SaveResult;
    try {
      result = await save(text, roles);
    } catch {
      result = { problems: [{ message: "연결이 끊겨서 올리지 못했어요. 인터넷 연결을 확인하고 이 파일만 다시 올려 주세요." }] };
    }
    if (result.problems.length > 0) {
      fail(name, ...result.problems);
      return;
    }
    const label = result.label ?? parsed.label;
    savedLabels.add(label);
    if (parsed.autoLabel) autoLabels.add(label);
    items.push({ name, status: "saved", label, utterances: parsed.utterances.length, notes: parsed.notes });
  };

  // 1단계: 역할을 알 수 있는 파일은 이름 순으로 먼저 저장한다. 화자 확인이 필요한 파일은 따로 모아 둔다.
  const pending: { name: string; text: string; confirm: Confirm }[] = [];
  for (const { name, text, error } of inputs) {
    onProgress?.(items.length + pending.length + 1, n, name);
    if (error) {
      fail(name, { message: error });
      continue;
    }
    const parsed = parse(text);
    if (!parsed.ok) {
      if (parsed.confirm && askRoles) pending.push({ name, text, confirm: parsed.confirm });
      else fail(name, ...parsed.problems);
      continue;
    }
    await saveOne(name, text, parsed);
  }

  // 2단계: 확인이 필요한 파일을 이름 순으로 한 개씩 묻는다. 고르기 전에는 서버로 아무것도 보내지 않는다.
  for (const [i, { name, text, confirm }] of pending.entries()) {
    let roles: Roles | null = null;
    try {
      roles = await askRoles!({ name, confirm, position: i + 1, total: pending.length, savedSoFar: items.filter((x) => x.status === "saved").length });
    } catch {
      roles = null; // 물을 수 없으면 건너뛴 것으로 본다(저장하지 않는다)
    }
    if (!roles) {
      items.push({ name, status: "skipped" });
      continue;
    }
    const parsed = parse(text, roles); // 서버로 보내기 전에 같은 검사를 다시 한다
    if (!parsed.ok) fail(name, ...parsed.problems);
    else await saveOne(name, text, parsed, roles);
  }

  const count = (status: BatchItem["status"]) => items.filter((x) => x.status === status).length;
  const [saved, skipped, failed] = [count("saved"), count("skipped"), count("failed")];
  const summary = n === 0 ? "" : `${saved}건 저장${skipped > 0 ? `, ${skipped}건 건너뜀` : ""}${failed > 0 ? `, ${failed}건 실패` : ""}`;
  return { rejected: null, items, summary };
}

// 같은 묶음에서 먼저 저장한 파일과 라벨이 겹칠 때의 안내. 자동으로 붙은 라벨이면 이유와 고치는 방법을 알려 준다.
function conflict(parsed: Extract<Parsed, { ok: true }>, assignedAutomatically: boolean): string {
  const label = parsed.label;
  if (!assignedAutomatically)
    return `참가자 ${label} 전사본이 이미 있어요. 같은 묶음에서 먼저 올린 파일을 저장했어요. 바꾸려면 목록에서 먼저 지우고 다시 올려 주세요.`;
  // 번호 없는 형식의 머리말 라벨이면 머리말을 지워 다른 글자로 저장할 수 있다. 번호 형식은 발언 번호에 라벨이 들어 있어 라벨과 번호를 바꿔야 한다.
  return parsed.notes.numbersAdded
    ? `같은 묶음의 다른 파일에 참가자 ${label} 라벨이 자동으로 붙었어요. 이 파일의 머리말을 지우면 다른 글자로 저장돼요.`
    : `같은 묶음의 다른 파일에 참가자 ${label} 라벨이 자동으로 붙었어요. 이 파일은 번호가 ${label}-01…로 정해져 있어 저장하지 못했어요. 파일의 라벨과 번호를 다른 글자로 바꾸거나, 목록에서 ${label} 전사본을 지우고 이 파일만 다시 올려 주세요.`;
}
