import { Button, ContentBadge, FallbackView, FallbackViewContent, FallbackViewText, SectionMessage, TextField, Typography } from "@montage-ui/core";
import Link from "next/link";
import { CiteLink } from "@/components/CiteLink";
import { Quote } from "@/components/Quote";
import { ViewSwitch } from "@/components/ViewSwitch";
import { check, mockAnswer } from "@/lib/mock";

const examples = ["예약할 때 어떤 문제가 있었나요?", "이용 경험을 정리해 주세요", "식당 메뉴는 어떤가요?"];

export default async function Ask({ searchParams }: { searchParams: Promise<{ q?: string | string[]; view?: string }> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  // 기본은 B안(문장 옆 번호). A안은 사용성 테스트 비교용으로 남겨 둔다.
  const view = sp.view === "a" ? "a" : "b";
  const href = (question: string, v: string) => `/ask?${new URLSearchParams({ q: question, view: v })}`;

  // 문장마다 검증된 근거만 남긴다. 검증된 근거가 하나도 없는 문장은 기본으로 숨긴다.
  const sentences = (q ? mockAnswer(q) : []).map((s) => ({
    ...s,
    verifiedIds: s.evidenceIds.filter((id) => check(id).status === "verified"),
  }));
  const shown = sentences.filter((s) => s.verifiedIds.length > 0);
  const hidden = sentences.filter((s) => s.verifiedIds.length === 0);
  const cited = [...new Set(shown.flatMap((s) => s.verifiedIds))]; // 번호는 이 순서대로 1부터

  return (
    <div className="space-y-8">
      {/* 5단계에서 실제 데이터로 바꾸면 이 안내를 지운다 */}
      <SectionMessage variant="info">이 화면은 아직 가짜 데이터(도서관 좌석 예약 앱)입니다. 올린 전사본과 연결되지 않았습니다.</SectionMessage>

      <div>
        <Typography as="h1" variant="title3" weight="bold" display="block">
          질문·답변
        </Typography>
        <p className="mt-2 text-fg-2">전사본에 있는 내용만 답합니다. 근거를 찾지 못하면 찾지 못했다고 알려 드립니다.</p>
      </div>

      <form action="/ask" className="flex flex-wrap gap-3">
        <input type="hidden" name="view" value={view} />
        <label htmlFor="q" className="sr-only">
          질문
        </label>
        <div className="min-w-0 flex-1">
          <TextField
            id="q"
            name="q"
            defaultValue={q}
            required
            maxLength={200}
            placeholder="예: 예약할 때 어떤 문제가 있었나요? (200자까지)"
          />
        </div>
        <Button type="submit" size="large">
          질문하기
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-fg-3">
          예시:
          {examples.map((e) => (
            <Link key={e} href={href(e, view)} className="font-medium text-accent hover:underline">
              {e}
            </Link>
          ))}
        </p>
        <div className="ml-auto w-72 max-w-full">
          <ViewSwitch view={view} hrefs={{ a: href(q, "a"), b: href(q, "b") }} />
        </div>
      </div>

      {q && shown.length === 0 && (
        <section className="flex justify-center rounded-2xl border border-dashed border-line-strong px-5">
          <FallbackView padding="compact">
            <FallbackViewContent>
              <FallbackViewText
                title="원문에서 근거를 찾지 못했습니다"
                description="전사본에 없는 내용은 지어내지 않습니다. 질문을 바꾸거나 전사본을 직접 확인해 주세요."
              />
            </FallbackViewContent>
          </FallbackView>
        </section>
      )}

      {shown.length > 0 && view === "a" && (
        <section className="space-y-6 rounded-2xl border border-line bg-surface p-6">
          <p className="leading-relaxed">{shown.map((s) => s.text).join(" ")}</p>
          <div>
            <h2 className="text-sm font-semibold text-fg-2">인용 {cited.length}개</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {cited.map((id) => (
                <Quote key={id} id={id} />
              ))}
            </div>
          </div>
        </section>
      )}

      {shown.length > 0 && view === "b" && (
        <section className="grid gap-6 md:grid-cols-[1fr_20rem] md:items-start">
          {/* 선택된 카드(#cite-n:target)를 가리키는 번호와 그 문장을 함께 강조한다. 선택 상태에만 적용된다. */}
          <style>
            {cited
              .map((_, i) => `section:has(#cite-${i + 1}:target) a[href="#cite-${i + 1}"]`)
              .join(",") +
              "{outline:2px solid var(--semantic-foreground-brand-primary);outline-offset:2px}" +
              cited.map((_, i) => `section:has(#cite-${i + 1}:target) p:has(> a[href="#cite-${i + 1}"])`).join(",") +
              "{background:var(--semantic-surface-brand-subtle);box-shadow:0 0 0 6px var(--semantic-surface-brand-subtle);border-radius:4px}"}
          </style>
          <div className="space-y-3 rounded-2xl border border-line bg-surface p-6 leading-relaxed">
            {shown.map((s) => (
              <p key={s.text}>
                {s.text}
                {s.verifiedIds.map((id) => (
                  <CiteLink key={id} n={cited.indexOf(id) + 1} />
                ))}
              </p>
            ))}
          </div>
          {/* 넓은 화면: 답변을 읽는 동안 패널이 따라오고, 화면보다 길면 패널 안에서만 스크롤된다. 안쪽 여백은 선택 테두리가 잘리지 않게 둔다. */}
          <aside className="space-y-3 md:sticky md:top-6 md:-m-1 md:max-h-[calc(100dvh-3rem)] md:overflow-y-auto md:p-1">
            <h2 className="text-sm font-semibold text-fg-2">원문 {cited.length}개</h2>
            {cited.map((id, i) => (
              <Quote key={id} id={id} n={i + 1} />
            ))}
          </aside>
        </section>
      )}

      {hidden.length > 0 && (
        <details className="rounded-2xl border border-line bg-surface px-6 py-4 text-sm">
          <summary className="cursor-pointer text-fg-2">근거 없는 문장 {hidden.length}개 보기</summary>
          <ul className="mt-4 space-y-3">
            {hidden.map((s) => (
              <li key={s.text} className="rounded-xl border border-dashed border-line-strong bg-fill px-4 py-3">
                <ContentBadge size="small" variant="outlined" color="neutral">
                  근거 없음
                </ContentBadge>
                <p className="mt-2 text-fg-2">{s.text}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
