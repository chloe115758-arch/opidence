import { Quote } from "@/components/Quote";
import { check, insights } from "@/lib/mock";

export default function Insights() {
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">주제 묶음</h1>
          <p className="mt-2 text-gray-600">비슷한 발언을 묶은 인사이트입니다. 인용을 누르면 원문 위치로 갑니다.</p>
        </div>
        {/* 분석은 3단계에서 연결한다 */}
        <button disabled className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white opacity-60">
          분석하기
        </button>
      </div>

      {insights.map((insight) => {
        const verified = insight.evidenceIds.filter((id) => check(id).status === "verified").length;
        return (
          <section key={insight.id} className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium">{insight.title}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${verified ? "bg-accent-soft text-accent" : "bg-gray-100 text-gray-600"}`}>
                {verified ? `근거 ${verified}개` : "근거 없음"}
              </span>
            </div>
            <p className="mt-2 text-gray-600">{insight.summary}</p>
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
