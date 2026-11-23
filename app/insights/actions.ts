"use server";

import { revalidatePath } from "next/cache";
import { aiConfig, loadPrompt, requestClusters } from "@/lib/ai/cluster";
import { parseClusters } from "@/lib/cluster";
import { checkEvidence } from "@/lib/evidence";
import { failure, failureFromError } from "@/lib/failure";
import { DAILY_ANALYSES, loadForAnalysis } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

// 성공하면 { ok: true }. 실패하면 사용자에게 보여 줄 문구와, 다시 해서 풀릴 수 있는 실패인지(retry)를 돌려준다(lib/failure.ts).
export type AnalyzeResult = { ok: true } | { ok: false; message: string; retry: boolean };

export async function analyze(): Promise<AnalyzeResult> {
  const fail = (message: string, retry = false): AnalyzeResult => ({ ok: false, message, retry });
  // 개발 환경에서만 원인(키, 모델 이름, 크레딧)을 문구에 쓴다. 배포에서는 서버 기록(console.error)에만 남는다.
  const dev = process.env.NODE_ENV !== "production";
  const fromFailure = (f: ReturnType<typeof failure>) => fail(f.message, f.retry);

  const db = await createClient();
  if (!(await db.auth.getClaims()).data) return fail("전사본을 먼저 올려 주세요.");

  const config = aiConfig();
  if (!config) return fromFailure(failure("setup", { task: "analysis", dev }));

  const { transcripts, pk } = await loadForAnalysis(db);
  if (transcripts.length === 0) return fail("전사본을 먼저 올려 주세요.");
  const prompt = await loadPrompt();
  // 기존 묶음이 있을 때만 실패 문구에 "기존 묶음은 그대로 있어요"를 붙인다(없는데 그렇게 말하면 어색하다).
  const { count: insightCount } = await db.from("insights").select("id", { count: "exact" }).limit(1);
  const existing = (insightCount ?? 0) > 0;

  // OpenAI를 부르기 전에 기록부터 남긴다. 하루 10회 제한은 이 행을 넣을 때 DB가 건다.
  // 응답이 온 분석은 저장에 실패해도 1회로 센다. 응답이 오지 않은 실패(api_error)는 기록만 남고 횟수에서 빠진다.
  const { data: run, error: refused } = await db
    .from("analysis_runs")
    .insert({ prompt_version: prompt.version, model: config.model })
    .select("id")
    .single();
  if (refused) {
    if (refused.code === "23514") return fromFailure(failure("limit", { task: "analysis", dev, max: DAILY_ANALYSES }));
    console.error("분석 기록 저장 실패:", refused.code, refused.message);
    return fromFailure(failure("start", { task: "analysis", dev }));
  }
  const started = Date.now();
  const finish = async (result: Record<string, unknown>) => {
    const { error } = await db
      .from("analysis_runs")
      .update({ ...result, duration_ms: Date.now() - started })
      .eq("id", run.id);
    if (error) console.error("분석 기록 갱신 실패:", error.code, error.message);
    revalidatePath("/insights"); // 남은 횟수 표시를 새로 고친다
  };

  let response;
  try {
    response = await requestClusters(config, prompt.text, transcripts);
  } catch (e) {
    // 키 값이 섞여 나오지 않도록 오류 이름과 상태 코드만 남긴다
    const err = e as { name?: string; status?: number; code?: string };
    console.error("OpenAI 호출 실패:", err.name, err.status, err.code);
    await finish({ status: "api_error" });
    return fromFailure(failureFromError(e, { task: "analysis", dev }));
  }
  const tokens = { input_tokens: response.inputTokens, output_tokens: response.outputTokens };

  const clusters = parseClusters(response.output);
  if (!clusters) {
    await finish({ status: "format_error", ...tokens });
    return fromFailure(failure("format", { task: "analysis", dev, existing }));
  }

  // 원문 대조: 정확히 일치하는 참가자 발언만 근거로 연결한다. 탈락한 ID도 이유와 함께 저장한다.
  const utterances = transcripts.flatMap((t) => t.utterances);
  const dropped: { id: string; reason: "not_found" | "moderator"; cluster: string }[] = [];
  let verified = 0;
  const payload = clusters.map((c) => ({
    title: c.title,
    summary: c.summary,
    evidence: c.utterance_ids.map((id) => {
      const { status } = checkEvidence(id, utterances);
      if (status === "verified") verified++;
      else dropped.push({ id, reason: status, cluster: c.title });
      return { returned_id: id, status, utterance_pk: status === "verified" ? pk.get(id) : null };
    }),
  }));

  // 기존 인사이트·근거 삭제와 새 저장을 한 트랜잭션으로 한다. 실패하면 기존 것이 남는다.
  const { error: failed } = await db.rpc("replace_insights", { p_clusters: payload });
  if (failed) {
    console.error("인사이트 저장 실패:", failed.code, failed.message);
    await finish({ status: "save_error", ...tokens });
    return fromFailure(failure("save", { task: "analysis", dev, existing }));
  }

  await finish({
    status: "ok",
    ...tokens,
    cluster_count: clusters.length,
    id_total: verified + dropped.length,
    id_verified: verified,
    id_not_found: dropped.filter((d) => d.reason === "not_found").length,
    id_moderator: dropped.filter((d) => d.reason === "moderator").length,
    dropped,
  });
  return { ok: true };
}
