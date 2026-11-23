"use client";

import { Button } from "@montage-ui/core";
import { useRef, useState } from "react";
import { buildReport, reportFileName, type ReportInsight } from "@/lib/report";

// 주제 분류 화면의 묶음 목록 위. 지금 보이는 묶음·요약·근거를 Markdown 글로 정리해 파일로 받거나 복사한다.
// 글은 브라우저에서 누를 때 만든다(서버로 보내는 것도, 새로 AI를 부르는 것도 없다). 만드는 규칙은 lib/report.ts.
export function ReportBar({ insights, transcriptCount, analyzedAt }: { insights: ReportInsight[]; transcriptCount: number; analyzedAt: string | null }) {
  const [status, setStatus] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = (text: string) => {
    setStatus(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(null), 4000);
  };
  const make = (now: Date) => buildReport({ insights, transcriptCount, analyzedAt, now });

  function download() {
    const now = new Date();
    // BOM은 붙이지 않는다: 일부 Markdown 뷰어가 첫 줄을 깨뜨린다
    const url = URL.createObjectURL(new Blob([make(now)], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = reportFileName(now);
    a.click();
    URL.revokeObjectURL(url);
    say("파일을 받았어요");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(make(new Date()));
      say("복사했어요");
    } catch {
      say("복사하지 못했어요. 파일로 받아 주세요."); // 클립보드는 https나 localhost에서만 쓸 수 있다
    }
  }

  return (
    <section aria-label="리포트 내보내기" className="rounded-2xl border border-line bg-surface px-6 py-4">
      <h2 className="text-base font-semibold text-fg">리포트 내보내기</h2>
      <p className="mt-1 text-sm text-fg-2">묶음과 원문 인용을 Markdown으로 정리해요. AI를 새로 쓰지 않아요.</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button className="tap" size="medium" onClick={download}>
          Markdown 파일로 받기
        </Button>
        <Button className="tap" size="medium" variant="outlined" onClick={copy}>
          복사
        </Button>
        <p role="status" aria-live="polite" className="min-w-0 text-sm break-words text-fg-2">
          {status}
        </p>
      </div>
      <p className="mt-3 text-sm text-fg-2">리포트에는 원문 인용이 그대로 들어가요. 공유하기 전에 이름 같은 개인정보가 없는지 확인해 주세요.</p>
    </section>
  );
}
