"use client";

import { useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import { upload } from "@/app/actions";
import { MAX_CHARS, parseTranscript, type Problem } from "@/lib/transcript";

const SHOWN = 10;

function Problems({ list }: { list: Problem[] }) {
  if (list.length === 0) return null;
  return (
    <div role="alert" className="mt-4 rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-left text-sm">
      <p className="font-medium text-gray-900">저장하지 않았습니다. 아래를 고친 뒤 다시 시도해 주세요.</p>
      <ul className="mt-2 space-y-1 text-gray-700">
        {list.slice(0, SHOWN).map((p, i) => (
          <li key={i} className="break-words">
            {p.line && <span className="mr-2 font-mono text-xs text-gray-500">{p.line}번째 줄</span>}
            {p.message}
          </li>
        ))}
      </ul>
      {list.length > SHOWN && <p className="mt-2 text-gray-500">외 {list.length - SHOWN}개</p>}
    </div>
  );
}

export function UploadForm() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [saved, setSaved] = useState("");
  const [pending, start] = useTransition();

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setSaved("");
    setProblems([]);
    start(async () => {
      try {
        // 10,000자는 UTF-8로 40KB를 넘지 않는다. 그보다 큰 파일은 읽지 않고 돌려보낸다.
        const text = file.size > MAX_CHARS * 4 ? "x".repeat(MAX_CHARS + 1) : await file.text();
        // 서버로 보내기 전에 같은 검사를 먼저 한다. 서버도 다시 검사한다.
        const parsed = parseTranscript(text);
        const result = parsed.ok ? await upload(text) : parsed.problems;
        setProblems(result);
        if (parsed.ok && result.length === 0) setSaved(`참가자 ${parsed.label} 전사본을 저장했습니다(발언 ${parsed.utterances.length}개).`);
      } catch {
        setProblems([{ message: "올리지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요." }]);
      }
      input.value = ""; // 같은 파일을 고쳐서 다시 고를 수 있게 한다
    });
  }

  return (
    <>
      <input
        id="file"
        type="file"
        accept=".txt,text/plain"
        disabled={pending}
        onChange={onChange}
        className="mt-3 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-accent file:px-4 file:py-2 file:text-white disabled:opacity-60"
      />
      <p aria-live="polite" className="mt-3 text-sm text-gray-700 empty:hidden">
        {pending ? "검사하고 저장하는 중…" : saved}
      </p>
      <Problems list={problems} />
    </>
  );
}

// 서버 액션을 실행하는 버튼. 진행 중 표시와 실패 문구를 함께 보여 준다.
export function ActionButton({
  action,
  pendingLabel,
  confirm,
  className,
  children,
}: {
  action: () => Promise<Problem[]>;
  pendingLabel: string;
  confirm?: string;
  className?: string;
  children: ReactNode;
}) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={`${className} disabled:opacity-60`}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            try {
              setProblems(await action());
            } catch {
              setProblems([{ message: "요청하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요." }]);
            }
          });
        }}
      >
        {pending ? pendingLabel : children}
      </button>
      <Problems list={problems} />
    </>
  );
}
