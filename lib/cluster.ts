// 주제 묶음에서 AI 호출과 무관한 부분: 보낼 글 만들기, 받은 응답의 형식 검사, 프롬프트 파일 읽기.
// OpenAI를 부르는 코드는 lib/ai/cluster.ts에 따로 둔다(서버 전용).
import { z } from "zod";
import type { Transcript } from "./types";

export const MAX_CLUSTERS = 8;

// AI에게 요구하는 응답 형식. 인용 문장을 담을 자리가 없다: 발언 ID만 받는다.
// OpenAI의 형식 강제(strict)는 문자열 길이 제한을 지원하지 않아, 여기에는 구조와 "최대 8개"만 넣는다.
export const responseFormat = z.object({
  clusters: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
        utterance_ids: z.array(z.string()),
      }),
    )
    .max(MAX_CLUSTERS),
});

// 받은 뒤 서버가 다시 하는 검사. 길이 제한은 DB 제약(제목 200자, ID 100자)과 맞춘다.
const accepted = z.strictObject({
  clusters: z
    .array(
      z.strictObject({
        title: z.string().trim().min(1).max(200),
        summary: z.string().trim().max(500),
        utterance_ids: z.array(z.string().max(100)).max(30),
      }),
    )
    .max(MAX_CLUSTERS),
});

export type Cluster = { title: string; summary: string; utterance_ids: string[] };

// 형식이 맞으면 묶음 목록, 틀리면 null. 틀린 응답은 고쳐 쓰지 않고 통째로 버린다.
export function parseClusters(raw: unknown): Cluster[] | null {
  const result = accepted.safeParse(raw);
  if (!result.success) return null;
  // 한 묶음 안에서 같은 ID가 두 번 오면 하나로 합친다. ID 문자열 자체는 고치지 않는다.
  return result.data.clusters.map((c) => ({ ...c, utterance_ids: [...new Set(c.utterance_ids)] }));
}

// 전사본 파일과 같은 줄 형식으로 보낸다. 진행자 발언도 맥락으로 함께 보낸다.
export function formatTranscripts(transcripts: Transcript[]): string {
  const body = transcripts
    .map((t) =>
      [
        `[참가자 ${t.label}${t.meta ? ` | ${t.meta}` : ""}]`,
        ...t.utterances.map((u) => `${u.id} ${u.role === "moderator" ? "진행자" : `참가자 ${u.label}`}: ${u.text}`),
      ].join("\n"),
    )
    .join("\n\n");
  return `<전사본>\n${body}\n</전사본>`;
}

// prompts/묶음.md에서 가장 아래 버전(## vN)의 코드 블록을 꺼낸다.
export function latestPrompt(markdown: string): { version: string; text: string } | null {
  const sections = markdown.split(/^## (v\d+)[ \t]*$/m); // [머리말, "v1", 본문, "v2", 본문, …]
  if (sections.length < 3) return null;
  const version = sections[sections.length - 2];
  const text = /```[^\n]*\n([\s\S]*?)\n```/.exec(sections[sections.length - 1])?.[1].trim();
  return text ? { version, text } : null;
}
