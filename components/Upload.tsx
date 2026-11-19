"use client";

import { Button, SectionMessage, TextButton } from "@montage-ui/core";
import { useRef, useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import { upload } from "@/app/actions";
import { MAX_CHARS, parseTranscript, type Problem } from "@/lib/transcript";

const SHOWN = 10;

function Problems({ list }: { list: Problem[] }) {
  if (list.length === 0) return null;
  return (
    <div role="alert" className="mt-4 w-full text-left">
      <SectionMessage
        variant="negative"
        description={
          <ul className="mt-1 space-y-1">
            {list.slice(0, SHOWN).map((p, i) => (
              <li key={i} className="break-words">
                {p.line && <span className="mr-2 font-mono text-xs text-fg-3">{p.line}번째 줄</span>}
                {p.message}
              </li>
            ))}
            {list.length > SHOWN && <li className="text-fg-3">외 {list.length - SHOWN}개</li>}
          </ul>
        }
      >
        저장하지 않았습니다. 아래를 고친 뒤 다시 시도해 주세요.
      </SectionMessage>
    </div>
  );
}

export function UploadForm() {
  const input = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [saved, setSaved] = useState("");
  const [pending, start] = useTransition();

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const file = el.files?.[0];
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
      el.value = ""; // 같은 파일을 고쳐서 다시 고를 수 있게 한다
    });
  }

  return (
    <>
      {/* Montage에 파일 올리기 컴포넌트가 없어, 숨긴 입력을 버튼으로 연다 */}
      <input ref={input} type="file" accept=".txt,text/plain" hidden onChange={onChange} />
      <Button size="medium" loading={pending} onClick={() => input.current?.click()}>
        txt 파일 선택
      </Button>
      <div aria-live="polite" className="w-full">
        {pending && <p className="mt-3 text-sm text-fg-3">검사하고 저장하는 중…</p>}
        {saved && !pending && (
          <div className="mt-4">
            <SectionMessage variant="positive">{saved}</SectionMessage>
          </div>
        )}
      </div>
      <Problems list={problems} />
    </>
  );
}

// 서버 액션을 실행하는 버튼. 진행 중 표시와 실패 문구를 함께 보여 준다.
export function ActionButton({
  action,
  variant = "solid",
  confirm,
  children,
}: {
  action: () => Promise<Problem[]>;
  variant?: "solid" | "text";
  confirm?: string;
  children: ReactNode;
}) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [pending, start] = useTransition();
  const onClick = () => {
    if (confirm && !window.confirm(confirm)) return;
    start(async () => {
      try {
        setProblems(await action());
      } catch {
        setProblems([{ message: "요청하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요." }]);
      }
    });
  };
  return (
    <>
      {variant === "solid" ? (
        <Button size="medium" loading={pending} onClick={onClick}>
          {children}
        </Button>
      ) : (
        <TextButton size="small" color="assistive" loading={pending} onClick={onClick}>
          {children}
        </TextButton>
      )}
      <Problems list={problems} />
    </>
  );
}
