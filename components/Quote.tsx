import { ContentBadge } from "@montage-ui/core";
import Link from "next/link";
import { check } from "@/lib/mock";

// 인용 카드. 문장은 AI 출력이 아니라 저장된 원문에서 ID로 찾아 보여 준다.
// n을 주면 B안의 번호가 붙고, 답변 문장의 번호 링크(#cite-n)가 이 카드를 가리킨다.
// 번호를 눌러 선택된 카드(:target)만 굵은 테두리와 옅은 배경으로 강조한다. A안 카드에는 id가 없어 평소 모양 그대로다.
export function Quote({ id, n }: { id: string; n?: number }) {
  const checked = check(id);
  const anchor = n ? `cite-${n}` : undefined;

  // "근거 없음"은 오류가 아니라 정상 상태다. 오류 색을 쓰지 않고 중립 색으로 둔다.
  if (checked.status !== "verified") {
    return (
      <div id={anchor} className="rounded-xl border border-dashed border-line-strong bg-fill px-4 py-3 text-sm">
        <ContentBadge size="small" variant="outlined" color="neutral">
          근거 없음
        </ContentBadge>
        <p className="mt-2 text-fg-2">
          {checked.status === "moderator"
            ? `진행자 발언(${id})은 근거로 쓰지 않습니다.`
            : `AI가 가리킨 발언 ID(${id})가 원문에 없습니다.`}
        </p>
      </div>
    );
  }

  const u = checked.utterance;
  return (
    <Link
      id={anchor}
      href={`/transcripts/${u.label}?u=${u.id}#${u.id}`}
      className="block scroll-mt-6 rounded-xl border border-line bg-surface px-4 py-3 shadow-card transition-colors hover:border-accent-line target:border-accent target:bg-accent-soft target:ring-2 target:ring-accent"
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3">
        {n && <span className="rounded-md bg-accent px-1.5 py-0.5 font-semibold text-white">{n}</span>}
        <span className="font-semibold text-fg-2">참가자 {u.label}</span>
        <span className="font-mono">{u.id}</span>
        <span>{u.seq}번째 발언</span>
      </p>
      <p className="mt-2 border-l-2 border-accent pl-3 break-words text-fg">{u.text}</p>
      <p className="mt-2 text-xs font-medium text-accent">원문에서 보기 →</p>
    </Link>
  );
}
