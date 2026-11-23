// 검색 · 찾기에서 AI 호출과 무관한 부분: 받은 응답의 형식 검사, 보낼 글 만들기.
// OpenAI를 부르는 코드는 lib/ai/answer.ts에 따로 둔다(서버 전용).
import { z } from "zod";
import type { Utterance } from "./types";

export const MAX_QUESTION = 200;
export const MAX_SENTENCES = 3;

// AI에게 요구하는 응답 형식. 인용 문장을 담을 자리가 없다: 발언 ID만 받는다. 근거를 못 찾으면 빈 목록이다.
export const responseFormat = z.object({
  sentences: z.array(z.object({ text: z.string(), utterance_ids: z.array(z.string()) })).max(MAX_SENTENCES),
});

// 받은 뒤 서버가 다시 하는 검사.
const accepted = z.strictObject({
  sentences: z
    .array(
      z.strictObject({
        text: z.string().trim().min(1).max(300),
        utterance_ids: z.array(z.string().max(100)).max(30),
      }),
    )
    .max(MAX_SENTENCES),
});

export type Sentence = { text: string; utterance_ids: string[] };

// 형식이 맞으면 문장 목록, 틀리면 null. 틀린 응답은 고쳐 쓰지 않고 통째로 버린다.
export function parseAnswer(raw: unknown): Sentence[] | null {
  const result = accepted.safeParse(raw);
  if (!result.success) return null;
  // 한 문장 안에서 같은 ID가 두 번 오면 하나로 합친다. ID 문자열 자체는 고치지 않는다.
  return result.data.sentences.map((s) => ({ ...s, utterance_ids: [...new Set(s.utterance_ids)] }));
}

// 질문과, 가까운 순으로 가져온 참가자 발언. 전사본 파일과 같은 줄 형식으로 보낸다.
export function formatQuestion(question: string, hits: Utterance[]): string {
  const lines = hits.map((u) => `${u.id} 참가자 ${u.label}: ${u.text}`).join("\n");
  return `<질문>\n${question}\n</질문>\n\n<발언>\n${lines}\n</발언>`;
}
