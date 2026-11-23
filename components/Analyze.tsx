"use client";

import { Button, SectionMessage } from "@montage-ui/core";
import { useEffect, useState, useTransition } from "react";
import { analyze } from "@/app/insights/actions";
import { networkFailure } from "@/lib/network-failure";

// 이 초를 넘으면 "조금 더 걸리고 있어요"로 바꾼다.
const SLOW_AFTER = 30;

// 분석 버튼, 오늘 남은 횟수, 진행 문구, 실패 안내.
// 호출이 한 번이라 중간 진행률은 알 수 없다. 고정 문구와 지난 시간만 보여 준다.
export function Analyze({ remaining, disabled, hasInsights }: { remaining: number; disabled: boolean; hasInsights: boolean }) {
  const [failed, setFailed] = useState<{ message: string; retry: boolean } | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!pending) return;
    const began = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - began) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  // 실제 분석 요청. "다시 시도"는 확인 창 없이 같은 요청을 다시 보낸다(이미 확인을 받았다).
  const execute = () => {
    setFailed(null);
    setSeconds(0);
    start(async () => {
      try {
        const result = await analyze();
        if (!result.ok) setFailed({ message: result.message, retry: result.retry });
      } catch {
        const f = networkFailure("analysis");
        setFailed({ message: f.message, retry: f.retry });
      }
    });
  };

  const run = () => {
    if (hasInsights && !window.confirm("다시 분석하면 지금 묶음과 근거를 지우고 새로 만들어요. 분석할 때마다 묶음이 조금 달라질 수 있어요. 오늘 남은 횟수도 1회 줄어요. 계속할까요?")) return;
    execute();
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button className="tap" size="medium" loading={pending} disabled={disabled || remaining === 0} onClick={run}>
          {hasInsights ? "다시 분석하기" : "분석하기"}
        </Button>
        <p className="text-sm text-fg-2">
          오늘 남은 분석 <span className="font-semibold text-fg">{remaining}회</span>
          <span className="text-fg-3"> · 하루 10회예요. 자정에 다시 채워져요</span>
        </p>
      </div>
      <div aria-live="polite">
        {pending && (
          // 실측(analysis_runs.duration_ms, 성공 3건): 15.6초~25.6초, 평균 19.7초. 출력이 길면 더 걸린다(25.6초는 출력 2,556토큰).
          // 스크린 리더가 매초 읽지 않도록 초 표시는 aria-hidden으로 두고, 안내 문장만 읽게 한다.
          <SectionMessage variant="info">
            {seconds > SLOW_AFTER ? "조금 더 걸리고 있어요. 창을 닫지 말고 기다려 주세요." : "발언을 읽고 주제를 묶고 있어요. 보통 15~30초 걸려요."}{" "}
            <span aria-hidden="true">· 분석하는 중… {seconds}초</span>
          </SectionMessage>
        )}
        {failed && !pending && (
          <div className="space-y-3">
            <SectionMessage variant="negative">{failed.message}</SectionMessage>
            {/* 다시 해서 풀릴 수 있는 실패에만 버튼을 둔다(lib/failure.ts) */}
            {failed.retry && (
              <Button size="small" onClick={execute}>
                다시 시도
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
