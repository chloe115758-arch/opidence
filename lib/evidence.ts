import type { Sentence } from "./answer";
import type { Utterance } from "./types";

export type Checked =
  | { id: string; status: "verified"; utterance: Utterance }
  | { id: string; status: "not_found" | "moderator" };

// 근거 규칙: 정확히 일치하는 참가자 발언 ID만 근거로 인정한다. 비슷한 ID를 고쳐 주지 않는다.
export function checkEvidence(id: string, utterances: Utterance[]): Checked {
  const utterance = utterances.find((u) => u.id === id);
  if (!utterance) return { id, status: "not_found" };
  if (utterance.role !== "participant") return { id, status: "moderator" };
  return { id, status: "verified", utterance };
}

export type AnsweredSentence = { text: string; evidence: Checked[]; grounded: boolean };

// 문장마다 발언 ID를 원문과 대조한다. known은 DB에서 ID로 찾아 온 발언이다(없는 ID는 목록에 없으니 not_found가 된다).
// grounded: 원문과 일치한 근거가 하나라도 있는 문장. 아니면 화면에서 "근거 없는 문장"으로 접는다.
export function checkAnswer(sentences: Sentence[], known: Utterance[]) {
  const answered: AnsweredSentence[] = sentences.map((s) => {
    const evidence = s.utterance_ids.map((id) => checkEvidence(id, known));
    return { text: s.text, evidence, grounded: evidence.some((e) => e.status === "verified") };
  });
  const dropped: { id: string; reason: "not_found" | "moderator" }[] = [];
  const cited = new Set<string>();
  let total = 0;
  for (const e of answered.flatMap((s) => s.evidence)) {
    total++;
    if (e.status === "verified") cited.add(e.id);
    else dropped.push({ id: e.id, reason: e.status });
  }
  return {
    sentences: answered,
    idTotal: total,
    idVerified: total - dropped.length,
    idNotFound: dropped.filter((d) => d.reason === "not_found").length,
    idModerator: dropped.filter((d) => d.reason === "moderator").length,
    cited: [...cited],
    dropped,
  };
}
