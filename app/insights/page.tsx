import { Button, ContentBadge, SectionMessage, Typography } from "@montage-ui/core";
import { Quote } from "@/components/Quote";
import { check, insights } from "@/lib/mock";

export default function Insights() {
  return (
    <div className="space-y-8">
      {/* 3단계에서 실제 데이터로 바꾸면 이 안내를 지운다 */}
      <SectionMessage variant="info">이 화면은 아직 가짜 데이터(도서관 좌석 예약 앱)입니다. 올린 전사본과 연결되지 않았습니다.</SectionMessage>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Typography as="h1" variant="title3" weight="bold" display="block">
            주제 묶음
          </Typography>
          <p className="mt-2 text-fg-2">비슷한 발언을 묶은 인사이트입니다. 인용을 누르면 원문 위치로 갑니다.</p>
        </div>
        {/* 분석은 3단계에서 연결한다 */}
        <Button size="medium" disabled>
          분석하기
        </Button>
      </div>

      {insights.map((insight) => {
        const verified = insight.evidenceIds.filter((id) => check(id).status === "verified").length;
        return (
          <section key={insight.id} className="rounded-2xl border border-line bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Typography as="h2" variant="headline1" weight="bold">
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
            <p className="mt-2 text-fg-2">{insight.summary}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {insight.evidenceIds.map((id) => (
                <Quote key={id} id={id} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
