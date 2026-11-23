import "server-only";
import { cache } from "react";
import { embedConfig } from "./ai/embed";
import { getTranscript, lastAnalysisAt, listInsights, listTranscripts, remainingAnalyses, remainingSearches, utterancesToEmbed } from "./store";
import { createClient } from "./supabase/server";

// 화면이 읽는 데이터. 한 요청 안에서는 같은 값을 한 번만 읽는다(React cache). 같은 화면의 여러 구역이 함께 쓴다.
const db = cache(() => createClient());

export const getTranscripts = cache(async () => listTranscripts(await db()));
export const getInsights = cache(async () => listInsights(await db()));
export const getLastAnalysisAt = cache(async () => lastAnalysisAt(await db()));
export const getRemainingAnalyses = cache(async () => remainingAnalyses(await db()));
export const getRemainingSearches = cache(async () => remainingSearches(await db()));
export const getTranscriptByLabel = cache(async (label: string) => getTranscript(await db(), label));

// 아직 검색용으로 읽어 두지 않은 참가자 발언 수. 0보다 크면 이번 검색이 "처음 한 번만 하는 준비"를 포함한다.
export const getPendingIndex = cache(async () => {
  const embedder = embedConfig();
  if (!embedder || (await getTranscripts()).length === 0) return 0;
  return (await utterancesToEmbed(await db(), embedder.model)).length;
});
