import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { ChatOpenAI } from "@langchain/openai";
import { formatQuestion, responseFormat } from "@/lib/answer";
import { latestPrompt } from "@/lib/cluster";
import type { Utterance } from "@/lib/types";
import { mocking } from "./cluster";
import { mockAnswer } from "./fixture";

export async function loadAnswerPrompt() {
  const prompt = latestPrompt(await fs.readFile(path.join(process.cwd(), "prompts", "근거.md"), "utf8"));
  if (!prompt) throw new Error("prompts/근거.md에서 프롬프트 버전(## v1)과 코드 블록을 찾지 못했습니다.");
  return prompt;
}

// AI를 한 번 부르고, 받은 것을 검사하지 않은 채 돌려준다. 형식 검사와 원문 대조는 부른 쪽에서 한다.
// 형식에 맞지 않는 응답이면 output이 null이다. 호출 자체가 실패하면 예외를 던진다.
// allUtterances는 MOCK_AI일 때만 쓴다(가짜 응답이 사용자의 전사본에서 번호를 고른다).
export async function requestAnswer(
  config: { apiKey: string; model: string },
  promptText: string,
  question: string,
  hits: Utterance[],
  allUtterances: Utterance[],
) {
  if (mocking()) return mockAnswer(allUtterances);
  const llm = new ChatOpenAI({ apiKey: config.apiKey, model: config.model, timeout: 120_000, maxRetries: 1 });
  const { raw, parsed } = await llm
    .withStructuredOutput(responseFormat, { name: "answer", method: "jsonSchema", strict: true, includeRaw: true })
    .invoke([
      ["system", promptText],
      ["human", formatQuestion(question, hits)],
    ]);
  const usage = "usage_metadata" in raw ? (raw.usage_metadata as { input_tokens?: number; output_tokens?: number } | undefined) : undefined;
  return { output: (parsed ?? null) as unknown, inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null };
}
