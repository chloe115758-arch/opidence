"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveTranscript } from "@/lib/store";
import { MAX_CHARS, parseTranscript, type Problem } from "@/lib/transcript";

// 모든 액션은 문제 목록을 돌려준다. 빈 배열이면 성공이다.

// 세션이 없으면 익명 로그인으로 작업 공간을 만든다. 로그인 화면은 없다.
async function workspace() {
  const db = await createClient();
  if ((await db.auth.getClaims()).data) return db;
  const { error } = await db.auth.signInAnonymously();
  if (error) console.error("익명 로그인 실패:", error.code, error.message);
  return error ? null : db;
}

// 업로드와 샘플 불러오기가 함께 쓰는 검사·저장 경로. 브라우저에서 검사했어도 여기서 다시 검사한다.
async function save(raw: string): Promise<Problem[]> {
  const parsed = parseTranscript(raw);
  if (!parsed.ok) return parsed.problems; // 형식이 틀리면 작업 공간(익명 사용자)도 만들지 않는다
  const db = await workspace();
  if (!db) return [{ message: "작업 공간을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요." }];
  const message = await saveTranscript(db, parsed);
  return message ? [{ message }] : [];
}

export async function upload(text: string): Promise<Problem[]> {
  if (typeof text !== "string" || text.length > MAX_CHARS * 2)
    return [{ message: `파일당 ${MAX_CHARS.toLocaleString()}자까지 올릴 수 있습니다. 내용을 줄이거나 나누어 올려 주세요.` }];
  const problems = await save(text);
  revalidatePath("/", "layout");
  return problems;
}

export async function loadSamples(): Promise<Problem[]> {
  const dir = path.join(process.cwd(), "data", "interviews");
  const names = (await fs.readdir(dir)).filter((name) => /^interview_[A-Z]\.txt$/.test(name)).sort();
  let problems: Problem[] = [];
  for (const name of names) {
    problems = (await save(await fs.readFile(path.join(dir, name), "utf8"))).map((p) => ({
      ...p,
      message: `${name}: ${p.message}`,
    }));
    if (problems.length) break; // 앞에서 저장한 전사본은 남긴다. 목록에서 확인하고 지울 수 있다.
  }
  revalidatePath("/", "layout");
  return problems;
}

export async function remove(label: string): Promise<Problem[]> {
  const db = await createClient();
  if (typeof label !== "string" || !(await db.auth.getClaims()).data) return [{ message: "지울 전사본을 찾지 못했습니다." }];
  // 발언과 그 발언을 가리키는 근거는 DB의 on delete cascade로 함께 지워진다
  const { error } = await db.from("transcripts").delete().eq("participant_label", label);
  if (error) console.error("전사본 삭제 실패:", error.code, error.message);
  revalidatePath("/", "layout");
  return error ? [{ message: "지우지 못했습니다. 잠시 뒤 다시 시도해 주세요." }] : [];
}
