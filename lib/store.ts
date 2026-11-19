// 전사본과 발언을 DB에 넣고 읽는다. 받은 클라이언트의 사용자 세션으로 접근하므로 RLS가 남의 행을 가린다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Parsed } from "./transcript";
import type { Transcript } from "./types";

export type TranscriptSummary = { label: string; meta: string; total: number; participant: number };

type DbError = { code?: string; message: string };

// 로그인하지 않은 요청은 테이블 권한이 없어 오류가 난다. 조회 전에 확인해 빈 작업 공간으로 보여 준다.
const signedIn = async (db: SupabaseClient) => !!(await db.auth.getClaims()).data;

// 저장에 성공하면 null, 실패하면 사용자에게 보여 줄 문구를 돌려준다.
export async function saveTranscript(db: SupabaseClient, t: Extract<Parsed, { ok: true }>): Promise<string | null> {
  const { data, error } = await db
    .from("transcripts")
    .insert({ participant_label: t.label, meta: t.meta, char_count: t.charCount })
    .select("id")
    .single();
  if (error) return explain(error, t.label);

  const { error: failed } = await db.from("utterances").insert(
    t.utterances.map((u) => ({ transcript_id: data.id, utterance_id: u.id, seq: u.seq, speaker_role: u.role, text: u.text })),
  );
  if (failed) {
    // shortcut: 두 번의 요청이라 한 트랜잭션이 아니다. 발언 저장이 실패하면 전사본을 지워 되돌린다. 이 삭제까지 실패하는 일이 생기면 DB 함수(rpc) 하나로 합친다.
    await db.from("transcripts").delete().eq("id", data.id);
    return explain(failed, t.label);
  }
  return null;
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
