"use client";

import { Button, SectionMessage } from "@montage-ui/core";
import { useEffect, useState, useTransition } from "react";
import { analyze } from "@/app/insights/actions";

// 분석 버튼, 오늘 남은 횟수, 진행 문구, 실패 안내.
// 호출이 한 번이라 중간 진행률은 알 수 없다. 고정 문구와 지난 시간만 보여 준다.
export function Analyze({ remaining, disabled, hasInsights }: { remaining: number; disabled: boolean; hasInsights: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!pending) return;
    const began = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - began) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  const run = () => {
    if (hasInsights && !window.confirm("다시 분석하면 지금 묶음과 근거를 지우고 새로 만듭니다. 분석할 때마다 묶음이 조금 달라질 수 있습니다. 계속할까요?")) return;
    setMessage(null);
    setSeconds(0);
    start(async () => {
      try {
        setMessage(await analyze());
      } catch {
        setMessage("분석하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
      }
    });
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button size="medium" loading={pending} disabled={disabled || remaining === 0} onClick={run}>
          {hasInsights ? "다시 분석하기" : "분석하기"}
        </Button>
        <p className="text-sm text-fg-2">
          오늘 남은 분석 <span className="font-semibold text-fg">{remaining}회</span>
          <span className="text-fg-3"> · 하루 10회, 자정에 다시 채워집니다</span>
        </p>
      </div>
      <div aria-live="polite">
        {pending && (
          // 실측(analysis_runs.duration_ms): 15.6초, 17.8초(전사본 입력 약 4천 토큰). 전사본이 늘면 길어지므로 "안팎"으로 쓴다.
          <SectionMessage variant="info">발언을 읽고 주제를 묶는 중입니다. 보통 20초 안팎으로 끝납니다 · {seconds}초 지남</SectionMessage>
        )}
        {message && !pending && <SectionMessage variant="negative">{message}</SectionMessage>}
      </div>
    </div>
  );
}
