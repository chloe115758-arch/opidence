import { ContentBadge, FallbackView, FallbackViewContent, FallbackViewText, Typography } from "@montage-ui/core";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Analyze } from "@/components/Analyze";
import { LogoMark } from "@/components/Logo";
import { Quote } from "@/components/Quote";
import { AnalyzeSkeleton, InsightListSkeleton } from "@/components/Skeletons";
import { getInsights, getRemainingAnalyses, getTranscripts } from "@/lib/data";

// 제목과 설명은 바로 그리고, 로그인 세션을 확인하는 부분(분석 영역, 묶음 목록)은 각각 Suspense 안에서 읽는다.
export default function Insights() {
  return (
    <div className="space-y-8">
      <div>
        <Typography as="h1" variant="title3" weight="bold" display="block">
          주제 분류
        </Typography>
        <p className="mt-2 text-fg-2">비슷한 발언을 주제별로 묶었어요. 인용을 누르면 원문으로 가요.</p>
      </div>

      <Suspense fallback={<AnalyzeSkeleton />}>
        <AnalyzeBox />
      </Suspense>
      <Suspense fallback={<InsightListSkeleton />}>
        <InsightList />
      </Suspense>
    </div>
  );
}

async function AnalyzeBox() {
  await connection();
  const [transcripts, insights, remaining] = await Promise.all([getTranscripts(), getInsights(), getRemainingAnalyses()]);
  return <Analyze remaining={remaining} disabled={transcripts.length === 0} hasInsights={insights.length > 0} />;
}

async function InsightList() {
  await connection();
  const [transcripts, insights] = await Promise.all([getTranscripts(), getInsights()]);
  const empty = transcripts.length === 0;

  return (
    <>
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
                      분석할 전사본이 없어요.{" "}
                      <Link href="/" className="font-medium text-accent hover:underline">
                        전사본 화면
                      </Link>
                      에서 파일을 올리거나 샘플을 불러오세요.
                    </>
                  }
                />
              ) : (
                <FallbackViewText
                  title="아직 묶음이 없어요"
                  description={`올린 전사본 ${transcripts.length}건을 분석하면 비슷한 발언을 주제별로 묶어 보여 줘요. 묶을 만한 주제가 없으면 분석해도 비어 있을 수 있어요.`}
                />
              )}
            </FallbackViewContent>
          </FallbackView>
        </section>
      )}

      {insights.map((insight) => {
        const verified = insight.evidence.filter((e) => e.status === "verified").length;
        // 대표 인용: 원문 대조를 통과한 첫 근거. 없으면 첫 항목("근거 없음" 카드)을 보여 준다.
        const lead = insight.evidence.find((e) => e.status === "verified") ?? insight.evidence[0];
        const rest = insight.evidence.filter((e) => e !== lead);
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
                이 묶음에는 연결된 발언이 없어요.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                <Quote checked={lead} />
                {rest.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer text-sm font-medium text-accent hover:underline">
                      <span className="group-open:hidden">원문 인용 {rest.length}개 더 보기</span>
                      <span className="hidden group-open:inline">접기</span>
                    </summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {rest.map((e) => (
                        <Quote key={e.id} checked={e} />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
