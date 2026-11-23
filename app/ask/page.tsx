import { FallbackView, FallbackViewContent, FallbackViewText, Typography } from "@montage-ui/core";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LogoMark } from "@/components/Logo";
import { Search } from "@/components/Search";
import { SearchSkeleton } from "@/components/Skeletons";
import { getPendingIndex, getRemainingSearches, getTranscripts } from "@/lib/data";

// 제목과 설명은 바로 그리고, 주소의 ?view=와 로그인 세션을 읽는 부분은 Suspense 안에서 한다.
export default function Ask({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  return (
    <div className="space-y-8">
      <div>
        <Typography as="h1" variant="title3" weight="bold" display="block">
          검색 · 찾기
        </Typography>
        <p className="mt-2 text-fg-2">전사본에 있는 내용만 답합니다. 근거를 찾지 못하면 찾지 못했다고 알려 드립니다.</p>
      </div>

      <Suspense fallback={<SearchSkeleton />}>
        <AskBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AskBody({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await connection();
  const sp = await searchParams;
  // 기본은 요약 문장 옆 번호가 보이는 화면(B). ?view=a는 번호를 숨기는 비교용 화면이다(사용성 테스트).
  const view = sp.view === "a" ? "a" : "b";

  const [transcripts, remaining, pendingIndex] = await Promise.all([getTranscripts(), getRemainingSearches(), getPendingIndex()]);
  if (transcripts.length > 0) return <Search remaining={remaining} disabled={false} pendingIndex={pendingIndex} view={view} />;

  return (
    <section className="flex justify-center rounded-2xl border border-dashed border-line-strong px-5">
      <FallbackView padding="compact">
        <FallbackViewContent>
          <LogoMark size={40} className="mx-auto mb-3" />
          <FallbackViewText
            title="전사본을 먼저 올려 주세요"
            description={
              <>
                찾을 전사본이 없습니다.{" "}
                <Link href="/" className="font-medium text-accent hover:underline">
                  전사본 화면
                </Link>
                에서 파일을 올리거나 샘플을 불러오세요.
              </>
            }
          />
        </FallbackViewContent>
      </FallbackView>
    </section>
  );
}
