// 전사본과 발언을 DB에 넣고 읽는다. 받은 클라이언트의 사용자 세션으로 접근하므로 RLS가 남의 행을 가린다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Checked } from "./evidence";
import type { Parsed } from "./transcript";
import type { Transcript, Utterance } from "./types";

export type TranscriptSummary = { label: string; meta: string; total: number; participant: number };

type DbError = { code?: string; message: string };

// 로그인하지 않은 요청은 테이블 권한이 없어 오류가 난다. 조회 전에 확인해 빈 작업 공간으로 보여 준다.
const signedIn = async (db: SupabaseClient) => !!(await db.auth.getClaims()).data;

// 저장에 성공하면 null, 실패하면 사용자에게 보여 줄 문구를 돌려준다. duplicate는 같은 라벨이 이미 있어서 실패했다는 뜻이다.
// 전사본과 발언은 DB 함수 save_transcript 한 번으로 저장한다(한 트랜잭션: 둘 다 되거나 둘 다 안 된다).
export async function saveTranscript(
  db: SupabaseClient,
  t: Extract<Parsed, { ok: true }>,
): Promise<{ message: string; duplicate: boolean } | null> {
  const { error } = await db.rpc("save_transcript", {
    p_label: t.label,
    p_meta: t.meta,
    p_char_count: t.charCount,
    p_utterances: t.utterances.map((u) => ({ utterance_id: u.id, seq: u.seq, speaker_role: u.role, text: u.text })),
  });
  return error ? { message: explain(error, t.label), duplicate: error.code === "23505" } : null;
}

function explain(error: DbError, label: string): string {
  if (error.code === "23505") return `참가자 ${label} 전사본이 이미 있습니다. 목록에서 먼저 지운 뒤 다시 올려 주세요.`;
  if (error.code === "23514" && error.message.includes("10건"))
    return "전사본은 10건까지 올릴 수 있습니다. 목록에서 쓰지 않는 전사본을 지운 뒤 다시 올려 주세요.";
  console.error("전사본 저장 실패:", error.code, error.message);
  return "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
}

export async function listTranscripts(db: SupabaseClient): Promise<TranscriptSummary[]> {
  if (!(await signedIn(db))) return [];
  const { data, error } = await db
    .from("transcripts")
    .select("participant_label, meta, utterances(speaker_role)")
    .order("participant_label");
  if (error) throw new Error(`전사본 목록을 불러오지 못했습니다(${error.code}).`);
  return data.map((t) => ({
    label: t.participant_label,
    meta: t.meta,
    total: t.utterances.length,
    participant: t.utterances.filter((u) => u.speaker_role === "participant").length,
  }));
}

export async function getTranscript(db: SupabaseClient, label: string): Promise<Transcript | null> {
  if (!(await signedIn(db))) return null;
  const { data, error } = await db
    .from("transcripts")
    .select("participant_label, meta, utterances(utterance_id, seq, speaker_role, text)")
    .eq("participant_label", label)
    .order("seq", { referencedTable: "utterances" })
    .maybeSingle();
  if (error) throw new Error(`전사본을 불러오지 못했습니다(${error.code}).`);
  if (!data) return null;
  return {
    label: data.participant_label,
    meta: data.meta,
    utterances: data.utterances.map((u) => ({
      id: u.utterance_id,
      label: data.participant_label,
      seq: u.seq,
      role: u.speaker_role,
      text: u.text,
    })),
  };
}

// ───────────── 주제 분류 ─────────────

export const DAILY_ANALYSES = 10;

export type StoredInsight = { id: string; title: string; summary: string; evidence: Checked[] };

// 분석에 보낼 전사본 전체와, 발언 ID → DB 행 번호(근거를 연결할 때 쓴다).
export async function loadForAnalysis(db: SupabaseClient): Promise<{ transcripts: Transcript[]; pk: Map<string, string> }> {
  const { data, error } = await db
    .from("transcripts")
    .select("participant_label, meta, utterances(id, utterance_id, seq, speaker_role, text)")
    .order("participant_label")
    .order("seq", { referencedTable: "utterances" });
  if (error) throw new Error(`전사본을 불러오지 못했습니다(${error.code}).`);
  const pk = new Map<string, string>();
  const transcripts = data.map((t) => ({
    label: t.participant_label as string,
    meta: t.meta as string,
    utterances: t.utterances.map((u): Utterance => {
      pk.set(u.utterance_id, u.id);
      return { id: u.utterance_id, label: t.participant_label, seq: u.seq, role: u.speaker_role, text: u.text };
    }),
  }));
  return { transcripts, pk };
}

// 저장된 인사이트. 인용 문장은 evidence에 없다: 연결된 발언(utterances)의 원문을 읽어 온다.
export async function listInsights(db: SupabaseClient): Promise<StoredInsight[]> {
  if (!(await signedIn(db))) return [];
  const { data, error } = await db
    .from("insights")
    .select("id, title, summary, evidence(returned_id, status, position, utterances(utterance_id, seq, speaker_role, text))")
    .order("position")
    .order("position", { referencedTable: "evidence" });
  if (error) throw new Error(`인사이트를 불러오지 못했습니다(${error.code}).`);
  return data.map((i) => ({
    id: i.id,
    title: i.title,
    summary: i.summary,
    evidence: i.evidence.map((e): Checked => {
      // 연결된 발언은 한 행뿐이다. 라이브러리 타입이 배열로 볼 때를 대비해 둘 다 받는다.
      const u = (Array.isArray(e.utterances) ? e.utterances[0] : e.utterances) as
        | { utterance_id: string; seq: number; speaker_role: Utterance["role"]; text: string }
        | null
        | undefined;
      if (e.status !== "verified" || !u) return { id: e.returned_id, status: e.status === "moderator" ? "moderator" : "not_found" };
      return {
        id: e.returned_id,
        status: "verified",
        utterance: { id: u.utterance_id, label: u.utterance_id.split("-")[0], seq: u.seq, role: u.speaker_role, text: u.text },
      };
    }),
  }));
}

// 오늘(한국 시간 자정 기준) 남은 분석 횟수. 실제 제한은 DB 트리거가 건다. 이 값은 화면 표시용이다.
export async function remainingAnalyses(db: SupabaseClient): Promise<number> {
  if (!(await signedIn(db))) return DAILY_ANALYSES;
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // 한국은 서머타임이 없어 +9시간 고정
  const { count, error } = await db
    .from("analysis_runs")
    .select("id", { count: "exact" }) // head: true로 세면 표가 없을 때도 오류 없이 넘어가서 쓰지 않는다
    .gte("created_at", `${today}T00:00:00+09:00`)
    .neq("status", "api_error") // OpenAI가 요청을 거부해 응답이 없던 실패는 세지 않는다(DB 트리거와 같은 기준)
    .limit(1);
  if (error) throw new Error(`분석 기록을 불러오지 못했습니다(${error.code}).`);
  return Math.max(0, DAILY_ANALYSES - (count ?? 0));
}

// ───────────── 검색 · 찾기 ─────────────

export const RETRIEVE_COUNT = 30; // 한 번에 가져오는 발언 수. DB 함수 match_utterances의 상한(30)과 같다

// 지금 모델로 임베딩이 아직 없는 참가자 발언. 진행자 발언은 임베딩하지 않는다.
export async function utterancesToEmbed(db: SupabaseClient, model: string): Promise<{ pk: string; text: string }[]> {
  const [people, done] = await Promise.all([
    db.from("utterances").select("id, text").eq("speaker_role", "participant"),
    db.from("utterance_embeddings").select("utterance_pk").eq("model", model),
  ]);
  if (people.error) throw new Error(`발언을 불러오지 못했습니다(${people.error.code}).`);
  if (done.error) throw new Error(`임베딩을 불러오지 못했습니다(${done.error.code}).`);
  const have = new Set(done.data.map((r) => r.utterance_pk as string));
  return people.data.filter((u) => !have.has(u.id)).map((u) => ({ pk: u.id as string, text: u.text as string }));
}

export async function saveEmbeddings(db: SupabaseClient, model: string, rows: { pk: string; vector: number[] }[]) {
  const { error } = await db
    .from("utterance_embeddings")
    .upsert(rows.map((r) => ({ utterance_pk: r.pk, model, embedding: r.vector })), { onConflict: "utterance_pk", ignoreDuplicates: true });
  if (error) throw new Error(`임베딩을 저장하지 못했습니다(${error.code}).`);
}

// 질문 벡터와 가까운 참가자 발언의 행 번호와 유사도, 가까운 순.
export async function matchUtterances(db: SupabaseClient, vector: number[], model: string): Promise<{ pk: string; similarity: number }[]> {
  const { data, error } = await db.rpc("match_utterances", { query_embedding: vector, p_model: model, match_count: RETRIEVE_COUNT });
  if (error) throw new Error(`비슷한 발언을 찾지 못했습니다(${error.code}).`);
  return (data as { utterance_pk: string; similarity: number }[]).map((r) => ({ pk: r.utterance_pk, similarity: r.similarity }));
}

export const DAILY_SEARCHES = 30;

const toUtterance = (r: { utterance_id: string; seq: number; speaker_role: Utterance["role"]; text: string }): Utterance => ({
  id: r.utterance_id,
  label: r.utterance_id.split("-")[0],
  seq: r.seq,
  role: r.speaker_role,
  text: r.text,
});

// 행 번호(pk)로 발언을 읽는다. 돌려주는 순서는 pks와 같다(가까운 순을 지킨다).
export async function utterancesByPk(db: SupabaseClient, pks: string[]): Promise<Utterance[]> {
  if (pks.length === 0) return [];
  const { data, error } = await db.from("utterances").select("id, utterance_id, seq, speaker_role, text").in("id", pks);
  if (error) throw new Error(`발언을 불러오지 못했습니다(${error.code}).`);
  const byPk = new Map(data.map((r) => [r.id as string, toUtterance(r)]));
  if (byPk.size !== new Set(pks).size) throw new Error("가져온 발언 중 일부를 읽지 못했습니다."); // 순서를 맞춰 쓰는 쪽이 어긋나지 않게 한다
  return pks.map((pk) => byPk.get(pk)!);
}

// 발언 ID(A-04)로 원문을 읽는다. 정확히 일치하는 ID만 찾고, 없는 ID는 결과에 없다.
export async function utterancesById(db: SupabaseClient, ids: string[]): Promise<Utterance[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db.from("utterances").select("utterance_id, seq, speaker_role, text").in("utterance_id", ids);
  if (error) throw new Error(`발언을 불러오지 못했습니다(${error.code}).`);
  return data.map(toUtterance);
}

// 오늘(한국 시간 자정 기준) 남은 검색 횟수. 실제 제한은 DB 트리거가 건다. 이 값은 화면 표시용이다.
export async function remainingSearches(db: SupabaseClient): Promise<number> {
  if (!(await signedIn(db))) return DAILY_SEARCHES;
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const { count, error } = await db
    .from("search_runs")
    .select("id", { count: "exact" })
    .gte("created_at", `${today}T00:00:00+09:00`)
    .neq("status", "api_error") // DB 트리거와 같은 기준
    .limit(1);
  if (error) throw new Error(`검색 기록을 불러오지 못했습니다(${error.code}).`);
  return Math.max(0, DAILY_SEARCHES - (count ?? 0));
}
