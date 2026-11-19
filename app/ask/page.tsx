import Link from "next/link";
import { Quote } from "@/components/Quote";
import { check, mockAnswer } from "@/lib/mock";

const examples = ["예약할 때 어떤 문제가 있었나요?", "식당 메뉴는 어떤가요?"];
const views = [
  { key: "a", label: "A안 · 답변 아래 인용 모음" },
  { key: "b", label: "B안 · 문장 옆 번호" },
];

export default async function Ask({ searchParams }: { searchParams: Promise<{ q?: string | string[]; view?: string }> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const view = sp.view === "b" ? "b" : "a";
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
      {/* 5단계에서 실제 데이터로 바꾸면 이 줄을 지운다 */}
      <p className="rounded-md bg-gray-100 px-4 py-2 text-center text-xs text-gray-500">
        이 화면은 아직 가짜 데이터(도서관 좌석 예약 앱)입니다. 올린 전사본과 연결되지 않았습니다.
      </p>
      <div>
        <h1 className="text-2xl font-semibold">질문·답변</h1>
        <p className="mt-2 text-gray-600">전사본에 있는 내용만 답합니다. 근거를 찾지 못하면 찾지 못했다고 알려 드립니다.</p>
      </div>

      <form action="/ask" className="flex flex-wrap gap-3">
        <input type="hidden" name="view" value={view} />
        <label htmlFor="q" className="sr-only">
          질문
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          required
          maxLength={200}
          placeholder="예: 예약할 때 어떤 문제가 있었나요? (200자까지)"
          className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 outline-accent"
        />
        <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">질문하기</button>
      </form>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-gray-500">
          예시:
          {examples.map((e) => (
            <Link key={e} href={href(e, view)} className="text-accent underline">
              {e}
            </Link>
          ))}
        </p>
        <div className="ml-auto flex gap-1 rounded-lg bg-gray-100 p-1">
          {views.map((v) => (
            <Link
              key={v.key}
              href={href(q, v.key)}
              aria-current={view === v.key ? "true" : undefined}
              className={`rounded-md px-3 py-1 ${view === v.key ? "bg-white font-medium shadow-sm" : "text-gray-600"}`}
            >
              {v.label}
            </Link>
          ))}
        </div>
      </div>

      {q && shown.length === 0 && (
        <section className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <h2 className="font-medium">원문에서 근거를 찾지 못했습니다</h2>
          <p className="mt-2 text-sm text-gray-600">전사본에 없는 내용은 지어내지 않습니다. 질문을 바꾸거나 전사본을 직접 확인해 주세요.</p>
        </section>
      )}

      {shown.length > 0 && view === "a" && (
        <section className="space-y-6 rounded-xl border border-gray-200 bg-white p-6">
          <p className="leading-relaxed">{shown.map((s) => s.text).join(" ")}</p>
          <div>
            <h2 className="text-sm font-medium text-gray-600">인용 {cited.length}개</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {cited.map((id) => (
                <Quote key={id} id={id} />
              ))}
            </div>
          </div>
        </section>
      )}

      {shown.length > 0 && view === "b" && (
        <section className="grid gap-6 md:grid-cols-[1fr_20rem]">
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 leading-relaxed">
            {shown.map((s) => (
              <p key={s.text}>
                {s.text}
                {s.verifiedIds.map((id) => {
                  const n = cited.indexOf(id) + 1;
                  return (
                    <a
                      key={id}
                      href={`#cite-${n}`}
                      aria-label={`근거 ${n} 보기`}
                      className="ml-1 rounded bg-accent px-1.5 py-0.5 align-text-top text-xs font-medium text-white"
                    >
                      {n}
                    </a>
                  );
                })}
              </p>
            ))}
          </div>
          <aside className="space-y-3">
            <h2 className="text-sm font-medium text-gray-600">원문 {cited.length}개</h2>
            {cited.map((id, i) => (
              <Quote key={id} id={id} n={i + 1} />
            ))}
          </aside>
        </section>
      )}

      {hidden.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white px-6 py-4 text-sm">
          <summary className="cursor-pointer text-gray-600">근거 없는 문장 {hidden.length}개 보기</summary>
          <ul className="mt-4 space-y-3">
            {hidden.map((s) => (
              <li key={s.text} className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3">
                <span className="mr-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-700">근거 없음</span>
                <span className="text-gray-600">{s.text}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
