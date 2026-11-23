// 전사본 파일 여러 개를 한 번에 올리는 규칙. 화면(components/Upload.tsx)과 테스트가 함께 쓴다.
// 파싱과 저장은 함수로 받는다: 화면은 parseTranscript와 서버 액션 upload를, 테스트는 가짜 저장소를 넘긴다.
import type { Parsed, Problem } from "./transcript";

// text는 화면이 파일에서 읽은 글이다. 읽지 못했거나 txt가 아니면 error에 이유를 담아 보낸다(그 파일은 실패로 표시한다).
export type BatchInput = { name: string; text: string; error?: string };

export type BatchItem =
  | { name: string; status: "saved"; label: string; utterances: number }
  | { name: string; status: "failed"; problems: Problem[] };

// rejected가 문자열이면 아무것도 저장하지 않았다는 뜻이다(고른 파일이 남은 자리보다 많다).
export type BatchResult = { rejected: string } | { rejected: null; items: BatchItem[]; summary: string };

type Deps = {
  parse: (raw: string) => Parsed;
  save: (text: string) => Promise<Problem[]>; // 빈 배열이면 저장됨
  onProgress?: (current: number, total: number, name: string) => void; // 저장을 시작할 때마다. current는 1부터
};

// 고른 파일 수로 센다(실패할 파일도 포함). 남은 자리보다 많으면 아무것도 올리지 않는다.
// 정상 파일은 저장하고 나머지는 이름·이유와 함께 실패로 돌려준다. 파일은 고른 순서대로 한 개씩 저장한다.
export async function runBatch(inputs: BatchInput[], remaining: number, { parse, save, onProgress }: Deps): Promise<BatchResult> {
  const n = inputs.length;
  if (n > remaining)
    return {
      rejected:
        remaining <= 0
          ? "더 올릴 자리가 없습니다. 목록에서 쓰지 않는 전사본을 지운 뒤 다시 올려 주세요. 아무것도 올리지 않았습니다."
          : `${remaining}건만 더 올릴 수 있습니다. 파일을 ${n}개 골랐으니 ${n - remaining}개를 빼고 다시 골라 주세요. 아무것도 올리지 않았습니다.`,
    };

  const items: BatchItem[] = [];
  const savedLabels = new Set<string>();
  const fail = (name: string, ...problems: Problem[]) => items.push({ name, status: "failed", problems });

  for (const [i, { name, text, error }] of inputs.entries()) {
    onProgress?.(i + 1, n, name);
    if (error) {
      fail(name, { message: error });
      continue;
    }
    const parsed = parse(text);
    if (!parsed.ok) {
      fail(name, ...parsed.problems);
      continue;
    }
    // 같은 참가자 파일이 두 개면 첫 번째만 저장한다. 두 번째는 서버에 보내지 않고 바로 알려 준다.
    if (savedLabels.has(parsed.label)) {
      fail(name, { message: `참가자 ${parsed.label} 전사본이 이미 있습니다. 같은 묶음에서 먼저 올린 파일을 저장했습니다. 바꾸려면 목록에서 먼저 지운 뒤 다시 올려 주세요.` });
      continue;
    }
    let problems: Problem[];
    try {
      problems = await save(text);
    } catch {
      problems = [{ message: "올리지 못했습니다. 인터넷 연결을 확인한 뒤 이 파일만 다시 올려 주세요." }];
    }
    if (problems.length > 0) fail(name, ...problems);
    else {
      savedLabels.add(parsed.label);
      items.push({ name, status: "saved", label: parsed.label, utterances: parsed.utterances.length });
    }
  }

  const saved = items.filter((x) => x.status === "saved").length;
  const failed = items.length - saved;
  return { rejected: null, items, summary: n === 0 ? "" : `${saved}건 저장${failed > 0 ? `, ${failed}건 실패` : ""}` };
}
