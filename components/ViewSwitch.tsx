"use client";

import { SegmentedControl, SegmentedControlItem } from "@montage-ui/core";
import { useRouter } from "next/navigation";

// 근거 표시 A안·B안 전환. 선택은 주소(?view=)에 담아 새로고침해도 유지된다. 전환해도 스크롤 위치는 그대로 둔다.
export function ViewSwitch({ view, hrefs }: { view: string; hrefs: Record<string, string> }) {
  const router = useRouter();
  return (
    <SegmentedControl size="small" value={view} onValueChange={(v) => router.push(hrefs[v], { scroll: false })} aria-label="근거 표시 방식">
      <SegmentedControlItem value="a">A안 인용 모음</SegmentedControlItem>
      <SegmentedControlItem value="b">B안 문장 옆 번호</SegmentedControlItem>
    </SegmentedControl>
  );
}
