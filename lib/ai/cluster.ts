import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { ChatOpenAI } from "@langchain/openai";
import { formatTranscripts, latestPrompt, responseFormat } from "@/lib/cluster";
import type { Transcript } from "@/lib/types";

// 키와 모델 이름은 환경 변수에서만 읽는다. 코드에 모델 이름을 쓰지 않는다.
export function aiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  return apiKey && model ? { apiKey, model } : null;
}

export async function loadPrompt() {
  const prompt = latestPrompt(await fs.readFile(path.join(process.cwd(), "prompts", "묶음.md"), "utf8"));
  if (!prompt) throw new Error("prompts/묶음.md에서 프롬프트 버전(## v1)과 코드 블록을 찾지 못했습니다.");
  return prompt;
}

// AI를 한 번 부르고, 받은 것을 검사하지 않은 채 돌려준다. 형식 검사와 원문 대조는 부른 쪽에서 한다.
// 형식에 맞지 않는 응답이면 output이 null이다. 호출 자체가 실패하면 예외를 던진다.
export async function requestClusters(config: { apiKey: string; model: string }, promptText: string, transcripts: Transcript[]) {
  const llm = new ChatOpenAI({ apiKey: config.apiKey, model: config.model, timeout: 120_000, maxRetries: 1 });
  const { raw, parsed } = await llm
    .withStructuredOutput(responseFormat, { name: "clusters", method: "jsonSchema", strict: true, includeRaw: true })
    .invoke([
      ["system", promptText],
      ["human", formatTranscripts(transcripts)],
    ]);
  const usage = "usage_metadata" in raw ? (raw.usage_metadata as { input_tokens?: number; output_tokens?: number } | undefined) : undefined;
  return { output: (parsed ?? null) as unknown, inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null };
}
