"use client";

import { Button, ContentBadge, FallbackView, FallbackViewContent, FallbackViewText, SectionMessage, TextField } from "@montage-ui/core";
import { useEffect, useState, useTransition } from "react";
import { ask, type AskResult } from "@/app/ask/actions";
import { CiteLink } from "@/components/CiteLink";
import { EXAMPLES } from "@/components/examples";
import { Quote } from "@/components/Quote";
import type { Checked } from "@/lib/evidence";

const MAX_QUESTION = 200; // lib/answer.ts의 MAX_QUESTION과 같다(서버가 다시 검사한다). 서버 전용 모듈이 아니어도 클라이언트 번들에 넣지 않으려고 따로 둔다.
const SLOW_AFTER = 30; // 이 초를 넘으면 "조금 더 걸리고 있어요"로 바꾼다.

// 입력, 남은 횟수, 진행 문구, 결과(위: 요약 문장, 아래: 찾은 발언).
// view="a"이면 요약 문장 옆 번호를 숨긴다(사용성 테스트 비교용). 기본(B)은 문장 옆 번호가 아래 원문 카드를 가리킨다.
export function Search({ remaining, disabled, pendingIndex, view }: { remaining: number; disabled: boolean; pendingIndex: number; view: "a" | "b" }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!pending) return;
    const began = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - began) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  const run = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setSeconds(0);
    start(async () => {
      try {
        setResult(await ask(question));
      } catch {
        setResult({ ok: false, message: "찾지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요." });
      }
    });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="flex flex-wrap gap-3">
        <label htmlFor="q" className="sr-only">
          찾고 싶은 내용
        </label>
        <div className="min-w-0 flex-1">
          <TextField
            id="q"
            name="q"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
            maxLength={MAX_QUESTION}
            placeholder="예: 이용하면서 불편했던 점은 무엇인가요? (200자까지)"
          />
        </div>
        <Button type="submit" size="large" loading={pending} disabled={disabled || remaining === 0}>
          찾기
        </Button>
      </form>

      <div className="space-y-2 text-sm">
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-fg-3">
          예시:
          {EXAMPLES.map((x) => (
            <button key={x} type="button" className="font-medium text-accent hover:underline" onClick={() => setQuestion(x)}>
              {x}
            </button>
          ))}
        </p>
        <p className="text-fg-2">
          오늘 남은 검색 <span className="font-semibold text-fg">{remaining}회</span>
          <span className="text-fg-3"> · 하루 30회, 자정에 다시 채워집니다</span>
        </p>
      </div>

      <div aria-live="polite">
        {pending && (
          // 걸린 시간은 추정해서 적지 않는다. 지난 시간만 보여 준다(스크린 리더가 매초 읽지 않도록 aria-hidden).
          <SectionMessage variant="info">
            {pendingIndex > 0
              ? `처음 한 번만 준비하는 중이에요. 전사본의 참가자 발언 ${pendingIndex}개를 검색용으로 읽어 두는 중이라 평소보다 오래 걸립니다. 다음부터는 이 준비 없이 바로 찾습니다.`
              : "비슷한 발언을 찾고 요약하는 중입니다."}{" "}
            {seconds > SLOW_AFTER && "조금 더 걸리고 있어요. 창을 닫지 말고 기다려 주세요. "}
            <span aria-hidden="true">· 찾는 중… {seconds}초</span>
          </SectionMessage>
        )}
        {result && !result.ok && !pending && <SectionMessage variant="negative">{result.message}</SectionMessage>}
      </div>

      {result?.ok && !pending && <Result result={result} view={view} />}
    </div>
  );
}

function Result({ result, view }: { result: Extract<AskResult, { ok: true }>; view: "a" | "b" }) {
  // 근거가 하나도 인정되지 않은 문장은 기본으로 숨긴다. 근거 번호는 보이는 문장에 나온 순서대로 1부터.
  const shown = result.sentences.filter((s) => s.grounded);
  const hidden = result.sentences.filter((s) => !s.grounded);
  const cards = new Map<string, Checked>();
  for (const e of shown.flatMap((s) => s.evidence)) if (e.status === "verified" && !cards.has(e.id)) cards.set(e.id, e);
  const cited = [...cards.keys()];
  const others = result.found.filter((u) => !cards.has(u.id)); // 질문과 가깝게 찾았지만 요약이 쓰지 않은 발언
  const numbered = view === "b";

  return (
    <div className="space-y-6">
      {result.indexed > 0 && <p className="text-sm text-fg-3">처음 한 번만 하는 준비를 마쳤습니다(발언 {result.indexed}개).</p>}

      {shown.length === 0 ? (
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
      ) : (
        <section className="space-y-6">
          {/* 선택된 카드(#cite-n:target)를 가리키는 번호와 그 문장을 함께 강조한다. 선택 상태에만 적용된다. */}
          {numbered && (
            <style>
              {cited.map((_, i) => `section:has(#cite-${i + 1}:target) a[href="#cite-${i + 1}"]`).join(",") +
                "{outline:2px solid var(--semantic-foreground-brand-primary);outline-offset:2px}" +
                cited.map((_, i) => `section:has(#cite-${i + 1}:target) p:has(> a[href="#cite-${i + 1}"])`).join(",") +
                "{background:var(--semantic-surface-brand-subtle);box-shadow:0 0 0 6px var(--semantic-surface-brand-subtle);border-radius:4px}"}
            </style>
          )}
          <div className="space-y-3 rounded-2xl border border-line bg-surface p-6 leading-relaxed">
            {shown.map((s) => {
              const dropped = s.evidence.filter((e) => e.status !== "verified");
              const moderator = dropped.filter((e) => e.status === "moderator").length;
              return (
                <div key={s.text}>
                  <p>
                    {s.text}
                    {numbered && s.evidence.flatMap((e) => (e.status === "verified" ? [<CiteLink key={e.id} n={cited.indexOf(e.id) + 1} />] : []))}
                  </p>
                  {dropped.length > 0 && (
                    // 걸러 낸 근거는 정상 상태다. 오류 색을 쓰지 않고 중립 색으로 알린다.
                    <p className="mt-1 text-xs text-fg-3">
                      인정하지 않은 근거 {dropped.length}개 (진행자 발언 {moderator}개 · 원문에 없는 번호 {dropped.length - moderator}개)
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-fg-2">근거 발언 {cited.length}개</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {cited.map((id, i) => (
                <Quote key={id} checked={cards.get(id)!} n={numbered ? i + 1 : undefined} />
              ))}
            </div>
          </div>
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

      {others.length > 0 && (
        <details className="rounded-2xl border border-line bg-surface px-6 py-4 text-sm">
          <summary className="cursor-pointer text-fg-2">
            {shown.length === 0 ? "질문과 가까운 발언" : "요약에 쓰지 않은 가까운 발언"} {others.length}개 보기
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {others.map((u) => (
              <Quote key={u.id} checked={{ id: u.id, status: "verified", utterance: u }} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
