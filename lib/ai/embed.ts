import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveEmbeddings, utterancesToEmbed } from "@/lib/store";
import { mocking } from "./cluster";
import { mockEmbedding } from "./fixture";

// 키와 모델 이름은 환경 변수에서만 읽는다. 코드에 모델 이름을 쓰지 않는다.
export function embedConfig() {
  if (mocking()) return { apiKey: "mock", model: "mock" };
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_EMBEDDING_MODEL;
  return apiKey && model ? { apiKey, model } : null;
}

type Config = { apiKey: string; model: string };

const BATCH = 100; // 한 번에 보내는 글 수

// 글 여러 개의 임베딩과 실제 토큰 수. 호출이 실패하면 상태 코드와 오류 코드만 담은 예외를 던진다(응답 본문·키는 담지 않는다).
export async function embedTexts(config: Config, texts: string[]): Promise<{ vectors: number[][]; tokens: number }> {
  if (mocking()) return { vectors: texts.map(mockEmbedding), tokens: 0 };
  const vectors: number[][] = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += BATCH) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, input: texts.slice(i, i + BATCH) }),
      signal: AbortSignal.timeout(60_000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.data) throw Object.assign(new Error("embedding failed"), { name: "EmbedError", status: res.status, code: json?.error?.code });
    const rows = (json.data as { index: number; embedding: number[] }[]).toSorted((a, b) => a.index - b.index);
    vectors.push(...rows.map((r) => r.embedding));
    tokens += json.usage?.total_tokens ?? 0;
  }
  return { vectors, tokens };
}

// 지금 모델로 임베딩이 없는 참가자 발언만 채운다. 첫 검색이면 전부, 이후에는 새로 올린 전사본의 발언만 만든다.
// 동시에 두 번 실행돼도 이미 있는 행은 건너뛴다(저장이 중복을 무시한다).
export async function ensureEmbeddings(db: SupabaseClient, config: Config): Promise<{ indexed: number; tokens: number }> {
  const todo = await utterancesToEmbed(db, config.model);
  if (todo.length === 0) return { indexed: 0, tokens: 0 };
  const { vectors, tokens } = await embedTexts(config, todo.map((u) => u.text));
  await saveEmbeddings(db, config.model, todo.map((u, i) => ({ pk: u.pk, vector: vectors[i] })));
  return { indexed: todo.length, tokens };
}
