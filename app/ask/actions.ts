"use server";

import { revalidatePath } from "next/cache";
import { loadAnswerPrompt, requestAnswer } from "@/lib/ai/answer";
import { aiConfig, mocking } from "@/lib/ai/cluster";
import { embedConfig, embedTexts, ensureEmbeddings } from "@/lib/ai/embed";
import { MAX_QUESTION, parseAnswer } from "@/lib/answer";
import { checkAnswer, type AnsweredSentence } from "@/lib/evidence";
import { listTranscripts, loadForAnalysis, matchUtterances, utterancesById, utterancesByPk } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import type { Utterance } from "@/lib/types";

export type AskResult =
  | { ok: false; message: string }
  // sentences: 요약 문장과 근거(원문은 DB에서 ID로 읽은 것). found: 질문과 가까운 순으로 가져온 발언 목록. indexed: 이번에 새로 준비한 발언 수.
  | { ok: true; sentences: AnsweredSentence[]; found: Utterance[]; indexed: number };

// 버튼으로 실행한다. 질문과 답변 문장은 저장하지 않는다: search_runs에는 횟수·토큰·시간·번호만 남긴다.
export async function ask(question: string): Promise<AskResult> {
  const fail = (message: string): AskResult => ({ ok: false, message });
  const q = typeof question === "string" ? question.trim() : "";
  if (!q) return fail("찾고 싶은 내용을 입력해 주세요.");
  if (q.length > MAX_QUESTION) return fail(`${MAX_QUESTION}자 이내로 써 주세요. 지금은 ${q.length}자입니다.`);

  const db = await createClient();
  if (!(await db.auth.getClaims()).data || (await listTranscripts(db)).length === 0) return fail("전사본을 먼저 올려 주세요.");

  const config = aiConfig();
  const embedder = embedConfig();
  if (!config || !embedder)
    return fail("검색 설정이 되어 있지 않습니다. 서버 환경 변수 OPENAI_API_KEY, OPENAI_MODEL, OPENAI_EMBEDDING_MODEL을 넣고 다시 시작해 주세요.");
  const prompt = await loadAnswerPrompt();

  // OpenAI를 부르기 전에 기록부터 남긴다. 하루 30회 제한은 이 행을 넣을 때 DB가 건다.
  const { data: run, error: refused } = await db
    .from("search_runs")
    .insert({ prompt_version: prompt.version, model: config.model, embedding_model: embedder.model })
    .select("id")
    .single();
  if (refused) {
    if (refused.code === "23514") return fail("오늘 검색 30회를 모두 썼습니다. 내일(한국 시간 자정 이후) 다시 찾을 수 있습니다.");
    console.error("검색 기록 저장 실패:", refused.code, refused.message);
    return fail("검색을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  }
  const started = Date.now();
  const finish = async (result: Record<string, unknown>) => {
    const { error } = await db
      .from("search_runs")
      .update({ ...result, duration_ms: Date.now() - started })
      .eq("id", run.id);
    if (error) console.error("검색 기록 갱신 실패:", error.code, error.message);
    revalidatePath("/ask"); // 남은 횟수와 "처음 한 번만 준비" 안내를 새로 고친다
  };

  // 실패했을 때도 여기까지 쓴 토큰과 새로 만든 발언 수는 기록한다.
  const spent: { embed_tokens?: number; indexed_count?: number } = {};
  let stage: "embed" | "answer" = "embed";
  let hits: { pk: string; similarity: number }[];
  let found: Utterance[];
  let response: Awaited<ReturnType<typeof requestAnswer>>;
  try {
    const indexed = await ensureEmbeddings(db, embedder);
    spent.indexed_count = indexed.indexed;
    spent.embed_tokens = indexed.tokens;
    const query = await embedTexts(embedder, [q]);
    spent.embed_tokens += query.tokens;
    hits = await matchUtterances(db, query.vectors[0], embedder.model);
    found = await utterancesByPk(db, hits.map((h) => h.pk));

    stage = "answer";
    // 가짜 응답(MOCK_AI)만 전체 발언이 필요하다. 진짜 호출에서는 가져온 발언만 보낸다.
    const all = mocking() ? (await loadForAnalysis(db)).transcripts.flatMap((t) => t.utterances) : [];
    response = await requestAnswer(config, prompt.text, q, found, all);
  } catch (e) {
    // 키 값이 섞여 나오지 않도록 오류 이름과 상태 코드만 남긴다
    const err = e as { name?: string; status?: number; code?: string };
    console.error("검색 실패:", stage, err.name, err.status, err.code);
    await finish({ status: "api_error", ...spent });
    const env = stage === "embed" ? "OPENAI_EMBEDDING_MODEL" : "OPENAI_MODEL";
    const why =
      err.code === "model_not_found" || err.status === 404
        ? `${env}에 적은 모델을 찾지 못했습니다. 모델 이름은 소문자까지 정확히 적어 주세요.`
        : err.status === 401
          ? "OPENAI_API_KEY가 올바르지 않습니다."
          : err.code === "insufficient_quota"
            ? "OpenAI 크레딧이 부족합니다."
            : err.status === 400
              ? "OpenAI가 요청 형식을 받지 않았습니다."
              : "잠시 뒤 다시 시도해 주세요.";
    return fail(`찾지 못했습니다. ${why} 오늘 남은 검색 횟수는 줄지 않았습니다.`);
  }
  const tokens = { ...spent, input_tokens: response.inputTokens, output_tokens: response.outputTokens };

  const sentences = parseAnswer(response.output);
  if (!sentences) {
    await finish({ status: "format_error", ...tokens, retrieved_count: found.length });
    return fail("답변이 형식에 맞지 않아 보여 드리지 않았습니다. 다시 찾아 주세요.");
  }

  // 원문 대조: 문장이 가리킨 발언 ID를 DB에서 정확히 일치하는 것만 읽어 온다. 인용 문장은 이 원문만 쓴다.
  let checked;
  try {
    const known = await utterancesById(db, [...new Set(sentences.flatMap((s) => s.utterance_ids))]);
    checked = checkAnswer(sentences, known);
  } catch (e) {
    console.error("원문 대조 실패:", (e as Error).message);
    await finish({ status: "api_error", ...tokens, retrieved_count: found.length });
    return fail("원문과 대조하지 못했습니다. 잠시 뒤 다시 시도해 주세요. 오늘 남은 검색 횟수는 줄지 않았습니다.");
  }

  await finish({
    status: "ok",
    ...tokens,
    retrieved_count: found.length,
    hits: hits.map((h, i) => ({ id: found[i].id, score: Math.round(h.similarity * 1e4) / 1e4 })),
    sentence_count: sentences.length,
    id_total: checked.idTotal,
    id_verified: checked.idVerified,
    id_not_found: checked.idNotFound,
    id_moderator: checked.idModerator,
    cited_ids: checked.cited,
    dropped: checked.dropped,
  });
  return { ok: true, sentences: checked.sentences, found, indexed: spent.indexed_count ?? 0 };
}
