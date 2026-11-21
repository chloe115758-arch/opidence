"use client";

import { Button, SectionMessage } from "@montage-ui/core";
import { useEffect, useState, useTransition } from "react";
import { analyze } from "@/app/insights/actions";

// 이 초를 넘으면 "조금 더 걸리고 있어요"로 바꾼다.
const SLOW_AFTER = 30;

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
          // 실측(analysis_runs.duration_ms, 성공 3건): 15.6초~25.6초, 평균 19.7초. 출력이 길면 더 걸린다(25.6초는 출력 2,556토큰).
          // 스크린 리더가 매초 읽지 않도록 초 표시는 aria-hidden으로 두고, 안내 문장만 읽게 한다.
          <SectionMessage variant="info">
            {seconds > SLOW_AFTER ? "조금 더 걸리고 있어요. 창을 닫지 말고 기다려 주세요." : "발언을 읽고 주제를 묶고 있습니다. 보통 15~30초 걸립니다."}{" "}
            <span aria-hidden="true">· 분석하는 중… {seconds}초</span>
          </SectionMessage>
        )}
        {message && !pending && <SectionMessage variant="negative">{message}</SectionMessage>}
      </div>
    </div>
  );
}
