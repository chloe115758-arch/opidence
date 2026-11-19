import Link from "next/link";
import { check } from "@/lib/mock";

// 인용 카드. 문장은 AI 출력이 아니라 저장된 원문에서 ID로 찾아 보여 준다.
// n을 주면 B안의 번호가 붙고, 답변 문장의 번호 링크(#cite-n)가 이 카드를 가리킨다.
export function Quote({ id, n }: { id: string; n?: number }) {
  const checked = check(id);
  const anchor = n ? `cite-${n}` : undefined;

  if (checked.status !== "verified") {
    return (
      <div id={anchor} className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm">
        <p className="font-medium text-gray-700">근거 없음</p>
        <p className="mt-1 text-gray-500">
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
      className="block scroll-mt-6 rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-accent target:border-accent target:ring-2 target:ring-accent/30"
    >
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
        {n && <span className="rounded bg-accent px-1.5 py-0.5 font-medium text-white">{n}</span>}
        <span className="font-medium text-gray-700">참가자 {u.label}</span>
        <span className="font-mono">{u.id}</span>
        <span>{u.seq}번째 발언</span>
      </p>
      <p className="mt-2 border-l-2 border-accent pl-3 break-words text-gray-900">{u.text}</p>
      <p className="mt-2 text-xs text-accent">원문에서 보기 →</p>
    </Link>
  );
}
