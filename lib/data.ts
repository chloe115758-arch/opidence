import "server-only";
import { cache } from "react";
import { listTranscripts } from "./store";
import { createClient } from "./supabase/server";

// 한 요청 안에서 전사본 목록을 한 번만 읽는다. 같은 화면의 여러 구역(업로드 칸의 남은 자리, 목록)이 함께 쓴다.
export const getTranscripts = cache(async () => listTranscripts(await createClient()));
