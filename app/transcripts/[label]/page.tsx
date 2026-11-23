import { ContentBadge, Typography } from "@montage-ui/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ScrollToHash } from "@/components/ScrollToHash";
import { getTranscriptByLabel } from "@/lib/data";

type Props = { params: Promise<{ label: string }>; searchParams: Promise<{ u?: string }> };

// 이 화면은 주소(params, searchParams)와 로그인 세션을 읽어야 그려지므로 "바로 보이는지" 검사(instant)는 건너뛴다.
// 안쪽에 Suspense를 두지 않는 이유: 인용 카드의 #발언번호 링크가 앱 안 이동에서도 해당 발언으로 스크롤되려면 본문이
// loading.tsx 경계 하나만 거쳐야 한다. 안쪽 Suspense를 두면 스크롤이 맨 위에 머문다(측정으로 확인). 경고 하나보다 근거로 가는 길이 먼저다.
export const instant = false;

export default async function TranscriptPage({ params, searchParams }: Props) {
  await connection(); // 요청이 올 때 그리는 화면임을 알린다(로그인 세션 확인의 Date.now() 경고를 없앤다)
  const { label } = await params;
  const { u: highlighted } = await searchParams;
  const transcript = /^[A-Z]$/.test(label) ? await getTranscriptByLabel(label) : null;
  if (!transcript) notFound();

  return (
    <div className="space-y-6">
      <ScrollToHash />
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
