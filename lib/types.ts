export type Utterance = {
  id: string; // 발언 ID. 예: A-04
  label: string; // 참가자 라벨. 예: A
  seq: number; // 전사본 안에서 몇 번째 발언인지
  role: "participant" | "moderator";
  text: string;
};

export type Transcript = { label: string; meta: string; utterances: Utterance[] };
