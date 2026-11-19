import { notFound } from "next/navigation";
import { transcripts as mockTranscripts } from "@/lib/mock";
import { getTranscript } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

export default async function TranscriptPage({
  params,
  searchParams,
}: {
  params: Promise<{ label: string }>;
  searchParams: Promise<{ u?: string }>;
}) {
  const { label } = await params;
  const { u: highlighted } = await searchParams;
  // 주제 묶음·질문 화면이 아직 가짜 데이터(X·Y)를 가리킨다. 그 화면을 DB에 연결하는 4단계에서 뒤쪽 대안을 지운다.
  const transcript =
    (/^[A-Z]$/.test(label) ? await getTranscript(await createClient(), label) : null) ??
    mockTranscripts.find((t) => t.label === label);
  if (!transcript) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">참가자 {transcript.label}</h1>
        <p className="mt-2 text-gray-600">{transcript.meta}</p>
      </div>

      <ol className="space-y-1 rounded-xl border border-gray-200 bg-white p-3">
        {transcript.utterances.map((u) => {
          const on = u.id === highlighted;
          return (
            // id는 인용 카드 링크(#A-04)가 스크롤할 위치다
            <li
              key={u.id}
              id={u.id}
              className={`scroll-mt-6 rounded-lg border-l-4 px-4 py-3 ${on ? "border-accent bg-accent-soft" : "border-transparent"}`}
            >
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                <span className="font-mono">{u.id}</span>
                <span className={u.role === "participant" ? "font-medium text-gray-700" : ""}>
                  {u.role === "participant" ? `참가자 ${u.label}` : "진행자"}
                </span>
                {on && <span className="rounded bg-accent px-1.5 py-0.5 font-medium text-white">인용된 발언</span>}
              </p>
              <p className={`mt-1 break-words ${u.role === "participant" ? "text-gray-900" : "text-gray-500"}`}>{u.text}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
