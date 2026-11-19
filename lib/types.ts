export type Utterance = {
  id: string; // 발언 ID. 예: A-04
  label: string; // 참가자 라벨. 예: A
  seq: number; // 전사본 안에서 몇 번째 발언인지
  role: "participant" | "moderator";
  text: string;
};

export type Transcript = { label: string; meta: string; utterances: Utterance[] };

// AI가 돌려주는 것은 발언 ID뿐이다. 인용 문장은 여기에 담지 않는다.
export type Insight = { id: string; title: string; summary: string; evidenceIds: string[] };
export type AnswerSentence = { text: string; evidenceIds: string[] };
