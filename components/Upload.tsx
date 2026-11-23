"use client";

import { Button, SectionMessage, TextButton } from "@montage-ui/core";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { refreshAfterUpload, upload } from "@/app/actions";
import { runBatch, type BatchInput, type BatchResult } from "@/lib/batch";
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

// 파일을 읽어 batch 입력으로 만든다. 읽지 못했거나 txt가 아니거나 너무 크면 error에 이유를 담는다(그 파일만 실패로 표시한다).
async function read(file: File): Promise<BatchInput> {
  const name = file.name;
  if (!/\.txt$/i.test(name)) return { name, text: "", error: "txt 파일만 올릴 수 있습니다. 메모장 등에서 txt로 저장한 파일을 골라 주세요." };
  // 10,000자는 UTF-8로 40KB를 넘지 않는다. 그보다 큰 파일은 읽지 않고 돌려보낸다.
  if (file.size > MAX_CHARS * 4)
    return { name, text: "", error: `파일당 ${MAX_CHARS.toLocaleString()}자까지 올릴 수 있습니다. 파일이 너무 큽니다. 내용을 줄이거나 나누어 올려 주세요.` };
  try {
    return { name, text: await file.text() };
  } catch {
    return { name, text: "", error: "파일을 읽지 못했습니다. 파일을 다시 골라 주세요." };
  }
}

// 결과: 맨 위 요약, 실패한 파일(이름·이유·고칠 방법), 저장한 파일. 다음 업로드를 시작하기 전까지 남고 닫기로 지운다.
function UploadResult({ outcome, onClose }: { outcome: BatchResult; onClose: () => void }) {
  const close = (
    <TextButton size="small" color="assistive" onClick={onClose}>
      닫기
    </TextButton>
  );
  if (outcome.rejected !== null)
    return (
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <SectionMessage variant="negative">{outcome.rejected}</SectionMessage>
        </div>
        {close}
      </div>
    );

  const saved = outcome.items.filter((x) => x.status === "saved");
  const failed = outcome.items.filter((x) => x.status === "failed");
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <SectionMessage variant={failed.length === 0 ? "positive" : saved.length === 0 ? "negative" : "cautionary"}>{outcome.summary}</SectionMessage>
        </div>
        {close}
      </div>
      {failed.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-fg-2">저장하지 않은 파일 {failed.length}개 · 아래를 고친 뒤 이 파일만 다시 올려 주세요</h3>
          <ul className="mt-2 space-y-2">
            {failed.map((f) => (
              <li key={f.name} className="rounded-xl border border-line-strong bg-fill px-4 py-3">
                <p className="font-semibold break-all text-fg">{f.name}</p>
                <ul className="mt-1 space-y-1 text-sm text-fg-2">
                  {f.status === "failed" &&
                    f.problems.slice(0, SHOWN).map((p, i) => (
                      <li key={i} className="break-words">
                        {p.line && <span className="mr-2 font-mono text-xs text-fg-3">{p.line}번째 줄</span>}
                        {p.message}
                      </li>
                    ))}
                  {f.status === "failed" && f.problems.length > SHOWN && <li className="text-fg-3">외 {f.problems.length - SHOWN}개</li>}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
      {saved.length > 0 && (
        <details open={saved.length <= 5} className="text-sm">
          <summary className="cursor-pointer text-fg-2">저장한 파일 {saved.length}개</summary>
          <ul className="mt-2 space-y-1">
            {saved.map((f) => (
              <li key={f.name} className="break-words text-fg-2">
                <span className="break-all font-medium text-fg">{f.name}</span>
                {f.status === "saved" && ` → 참가자 ${f.label} (발언 ${f.utterances}개)`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// 여러 파일을 고르거나 끌어다 놓아 올린다. 정상 파일은 저장하고 나머지는 이유와 함께 알려 준다(규칙: lib/batch.ts).
export function UploadForm({ remaining }: { remaining: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [outcome, setOutcome] = useState<BatchResult | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();

  function handle(list: FileList | null) {
    const files = list ? [...list] : [];
    if (files.length === 0 || pending) return;
    setOutcome(null); // 새 업로드를 시작하면 이전 결과를 지운다. 그 전까지는 남아 있다.
    start(async () => {
      try {
        const inputs = await Promise.all(files.map(read));
        const result = await runBatch(inputs, remaining, {
          parse: parseTranscript, // 서버로 보내기 전에 같은 검사를 먼저 한다. 서버도 다시 검사한다.
          save: upload,
          onProgress: (current, total, name) => setProgress({ current, total, name }),
        });
        setOutcome(result);
        if (result.rejected === null && result.items.some((x) => x.status === "saved")) await refreshAfterUpload();
      } catch {
        setOutcome({ rejected: "올리지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요." });
      } finally {
        setProgress(null);
      }
    });
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault(); // 이걸 막지 않으면 브라우저가 놓은 파일을 그냥 열어 버린다
        if (!pending) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files);
      }}
      className={`rounded-2xl border-2 border-dashed px-5 py-5 text-center transition-colors ${dragging ? "border-accent bg-accent-soft" : "border-line-strong"}`}
    >
      {/* Montage에 파일 올리기 컴포넌트가 없어, 숨긴 입력을 버튼으로 연다 */}
      <input
        ref={input}
        type="file"
        multiple
        accept=".txt,text/plain"
        hidden
        onChange={(e) => {
          handle(e.currentTarget.files);
          e.currentTarget.value = ""; // 같은 파일을 고쳐서 다시 고를 수 있게 한다
        }}
      />
      <p className="text-sm text-fg-2">여기에 txt 파일을 끌어다 놓거나 아래 버튼으로 고르세요. 여러 개를 한꺼번에 올릴 수 있습니다.</p>
      <p className="mt-1 mb-3 text-xs text-fg-3">남은 자리 {remaining}건</p>
      <Button size="medium" loading={pending} onClick={() => input.current?.click()}>
        txt 파일 선택
      </Button>
      <div aria-live="polite" className="mt-3 w-full text-left">
        {pending && (
          <p className="text-center text-sm text-fg-3">
            {progress ? `${progress.current}/${progress.total} 저장 중 · ${progress.name}` : "파일을 읽는 중…"}
          </p>
        )}
        {outcome && !pending && <UploadResult outcome={outcome} onClose={() => setOutcome(null)} />}
      </div>
    </div>
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
