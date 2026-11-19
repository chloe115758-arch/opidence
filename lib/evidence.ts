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
