import { ContentBadge, Typography } from "@montage-ui/core";
import Link from "next/link";
import { notFound } from "next/navigation";
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
  const transcript = /^[A-Z]$/.test(label) ? await getTranscript(await createClient(), label) : null;
  if (!transcript) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm font-medium text-fg-3 hover:text-fg">
          ← 전사본 목록
        </Link>
        <Typography as="h1" variant="title3" weight="bold" display="block" sx={{ marginTop: 8 }}>
          참가자 {transcript.label}
        </Typography>
        <p className="mt-2 break-words text-fg-2">{transcript.meta}</p>
      </div>

      <ol className="space-y-1 rounded-2xl border border-line bg-surface p-3">
        {transcript.utterances.map((u) => {
          const on = u.id === highlighted;
          const participant = u.role === "participant";
          return (
            // id는 인용 카드 링크(#A-04)가 스크롤할 위치다
            <li
              key={u.id}
              id={u.id}
              className={`scroll-mt-6 rounded-xl border-l-4 px-4 py-3 ${on ? "border-accent bg-accent-soft" : "border-transparent"}`}
            >
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3">
                <span className="font-mono">{u.id}</span>
                <span className={participant ? "font-semibold text-fg-2" : ""}>{participant ? `참가자 ${u.label}` : "진행자"}</span>
                {on && (
                  <ContentBadge size="xsmall" variant="solid" color="accent" accentColor="semantic.foreground.brand.primary">
                    인용된 발언
                  </ContentBadge>
                )}
              </p>
              <p className={`mt-1 break-words ${participant ? "text-fg" : "text-fg-3"}`}>{u.text}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
