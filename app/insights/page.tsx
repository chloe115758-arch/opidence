import { ContentBadge, FallbackView, FallbackViewContent, FallbackViewText, Typography } from "@montage-ui/core";
import Link from "next/link";
import { Analyze } from "@/components/Analyze";
import { LogoMark } from "@/components/Logo";
import { Quote } from "@/components/Quote";
import { listInsights, listTranscripts, remainingAnalyses } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

export default async function Insights() {
  const db = await createClient();
  const [transcripts, insights, remaining] = await Promise.all([listTranscripts(db), listInsights(db), remainingAnalyses(db)]);
  const empty = transcripts.length === 0;

  return (
    <div className="space-y-8">
      <div>
        <Typography as="h1" variant="title3" weight="bold" display="block">
          주제 묶음
        </Typography>
        <p className="mt-2 text-fg-2">비슷한 발언을 묶은 인사이트입니다. 인용을 누르면 원문 위치로 갑니다.</p>
      </div>

      <Analyze remaining={remaining} disabled={empty} hasInsights={insights.length > 0} />

      {insights.length === 0 && (
        <section className="flex justify-center rounded-2xl border border-dashed border-line-strong px-5">
          <FallbackView padding="compact">
            <FallbackViewContent>
              <LogoMark size={40} className="mx-auto mb-3" />
              {empty ? (
                <FallbackViewText
                  title="전사본을 먼저 올려 주세요"
                  description={
                    <>
                      분석할 전사본이 없습니다.{" "}
                      <Link href="/" className="font-medium text-accent hover:underline">
                        전사본 화면
                      </Link>
                      에서 파일을 올리거나 샘플을 불러오세요.
                    </>
                  }
                />
              ) : (
                <FallbackViewText
                  title="아직 묶음이 없습니다"
                  description={`올린 전사본 ${transcripts.length}건을 분석하면 비슷한 발언을 주제별로 묶어 보여 줍니다. 묶을 만한 주제가 없으면 분석해도 비어 있을 수 있습니다.`}
                />
              )}
            </FallbackViewContent>
          </FallbackView>
        </section>
      )}

      {insights.map((insight) => {
        const verified = insight.evidence.filter((e) => e.status === "verified").length;
        return (
          <section key={insight.id} className="rounded-2xl border border-line bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Typography as="h2" variant="headline1" weight="bold" sx={{ overflowWrap: "anywhere" }}>
                {insight.title}
              </Typography>
              {verified ? (
                <ContentBadge size="small" variant="solid" color="accent" accentColor="semantic.foreground.brand.primary">
                  근거 {verified}개
                </ContentBadge>
              ) : (
                <ContentBadge size="small" variant="outlined" color="neutral">
                  근거 없음
                </ContentBadge>
              )}
            </div>
            <p className="mt-2 break-words text-fg-2">{insight.summary}</p>
            {insight.evidence.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-line-strong bg-fill px-4 py-3 text-sm text-fg-2">
                AI가 이 묶음에 발언 ID를 하나도 붙이지 않았습니다.
              </p>
            ) : (
              <details className="group mt-5">
                <summary className="cursor-pointer text-sm font-medium text-accent hover:underline">
                  <span className="group-open:hidden">원문 인용 {insight.evidence.length}개 보기</span>
                  <span className="hidden group-open:inline">원문 인용 접기</span>
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {insight.evidence.map((e) => (
                    <Quote key={e.id} checked={e} />
                  ))}
                </div>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
