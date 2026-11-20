"use server";

import { revalidatePath } from "next/cache";
import { aiConfig, loadPrompt, requestClusters } from "@/lib/ai/cluster";
import { parseClusters } from "@/lib/cluster";
import { checkEvidence } from "@/lib/evidence";
import { loadForAnalysis } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

// 실패하면 사용자에게 보여 줄 문구, 성공하면 null.
export async function analyze(): Promise<string | null> {
  const db = await createClient();
  if (!(await db.auth.getClaims()).data) return "전사본을 먼저 올려 주세요.";

  const config = aiConfig();
  if (!config) return "분석 설정이 되어 있지 않습니다. 서버 환경 변수 OPENAI_API_KEY와 OPENAI_MODEL을 넣고 다시 시작해 주세요.";

  const { transcripts, pk } = await loadForAnalysis(db);
  if (transcripts.length === 0) return "전사본을 먼저 올려 주세요.";
  const prompt = await loadPrompt();

  // OpenAI를 부르기 전에 기록부터 남긴다. 하루 10회 제한은 이 행을 넣을 때 DB가 건다.
  // 응답이 온 분석은 저장에 실패해도 1회로 센다. 응답이 오지 않은 실패(api_error)는 기록만 남고 횟수에서 빠진다.
  const { data: run, error: refused } = await db
    .from("analysis_runs")
    .insert({ prompt_version: prompt.version, model: config.model })
    .select("id")
    .single();
  if (refused) {
    if (refused.code === "23514") return "오늘 분석 10회를 모두 썼습니다. 내일(한국 시간 자정 이후) 다시 분석할 수 있습니다.";
    console.error("분석 기록 저장 실패:", refused.code, refused.message);
    return "분석을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
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
    const why =
      err.code === "model_not_found" || err.status === 404
        ? "OPENAI_MODEL에 적은 모델을 찾지 못했습니다. 모델 이름은 소문자까지 정확히 적어 주세요."
        : err.status === 401
          ? "OPENAI_API_KEY가 올바르지 않습니다."
          : err.code === "insufficient_quota"
            ? "OpenAI 크레딧이 부족합니다."
            : err.status === 400
              ? "OpenAI가 요청 형식을 받지 않았습니다."
              : "잠시 뒤 다시 시도해 주세요.";
    return `분석하지 못했습니다. ${why} 오늘 남은 분석 횟수는 줄지 않았습니다.`;
  }
  const tokens = { input_tokens: response.inputTokens, output_tokens: response.outputTokens };

  const clusters = parseClusters(response.output);
  if (!clusters) {
    await finish({ status: "format_error", ...tokens });
    return "분석 결과가 형식에 맞지 않아 저장하지 않았습니다. 다시 분석해 주세요.";
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
    return "분석 결과를 저장하지 못했습니다. 기존 묶음은 그대로 있습니다. 다시 분석해 주세요.";
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
  return null;
}
