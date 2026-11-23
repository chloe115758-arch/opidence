import { FallbackView, FallbackViewContent, FallbackViewText, Typography } from "@montage-ui/core";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { Search } from "@/components/Search";
import { embedConfig } from "@/lib/ai/embed";
import { listTranscripts, remainingSearches, utterancesToEmbed } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

export default async function Ask({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  // 기본은 요약 문장 옆 번호가 보이는 화면(B). ?view=a는 번호를 숨기는 비교용 화면이다(사용성 테스트).
  const view = sp.view === "a" ? "a" : "b";

  const db = await createClient();
  const [transcripts, remaining] = await Promise.all([listTranscripts(db), remainingSearches(db)]);
  const empty = transcripts.length === 0;
  // 아직 검색용으로 읽어 두지 않은 발언 수. 0보다 크면 이번 검색이 "처음 한 번만 하는 준비"를 포함한다.
  const embedder = embedConfig();
  const pendingIndex = embedder && !empty ? (await utterancesToEmbed(db, embedder.model)).length : 0;

  return (
    <div className="space-y-8">
      <div>
        <Typography as="h1" variant="title3" weight="bold" display="block">
          검색 · 찾기
        </Typography>
        <p className="mt-2 text-fg-2">전사본에 있는 내용만 답합니다. 근거를 찾지 못하면 찾지 못했다고 알려 드립니다.</p>
      </div>

      {empty ? (
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
      ) : (
        <Search remaining={remaining} disabled={false} pendingIndex={pendingIndex} view={view} />
      )}
    </div>
  );
}
