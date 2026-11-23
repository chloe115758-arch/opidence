"use client";

import { Button, SectionMessage, SegmentedControl, SegmentedControlItem, TextButton } from "@montage-ui/core";
import { useState } from "react";
import { checkRoles, isFew, summarizeRoles, type Role, type Roles, type SpeakerInfo } from "@/lib/speakers";

// 화자 확인: 역할을 알 수 없는 전사본에서 화자마다 진행자·참가자를 고른다. 업로드와 서버 액션을 모르는 화면이라
// 나중에 "텍스트 붙여넣기" 미리보기도 같은 모양으로 쓴다(그때는 skipLabel="취소"). 고르기 전에는 아무것도 서버로 보내지 않는다.
// speakers와 defaults는 lib/transcript.ts의 parseTranscript가 돌려준 confirm 값이다. 저장은 부르는 쪽이 한다.
export function SpeakerConfirm({
  title,
  progress,
  notice,
  speakers,
  defaults,
  saveLabel = "이 역할로 저장",
  skipLabel = "이 파일 건너뛰기",
  onSave,
  onSkip,
}: {
  title: string; // 파일 이름 등
  progress?: string; // 여러 파일 중 몇 번째인지. 예: "2/3"
  notice?: string; // 위쪽에 덧붙일 안내
  speakers: SpeakerInfo[];
  defaults: Roles;
  saveLabel?: string;
  skipLabel?: string;
  onSave: (roles: Roles) => void;
  onSkip: () => void;
}) {
  const [roles, setRoles] = useState<Roles>(defaults);
  const problems = checkRoles(speakers, roles);
  const sum = summarizeRoles(speakers, roles);
  // 규칙이 처음 말한 화자를 진행자로 미리 골랐을 때만 그렇게 알린다(표기가 알려 주는 역할만 있으면 그냥 확인을 부탁한다)
  const guessedModerator = speakers.some((s) => s.known === null && defaults[s.key] === "moderator");

  return (
    <section aria-label="화자 확인" className="space-y-4 text-left">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-base font-semibold text-fg">화자를 확인해 주세요</h3>
          {progress && <span className="text-sm text-fg-3">{progress}</span>}
        </div>
        <p className="mt-1 text-sm font-medium break-all text-fg-2">{title}</p>
        {notice && <p className="mt-2 text-sm text-fg-2">{notice}</p>}
        <p className="mt-2 text-sm text-fg-2">
          {guessedModerator ? "처음 말한 화자를 진행자로 미리 골랐어요. 맞는지 확인해 주세요." : "미리 고른 역할이 맞는지 확인해 주세요."}
        </p>
      </div>

      <ul className="space-y-3">
        {speakers.map((s) => (
          <li key={s.key} className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-semibold break-all text-fg">{s.token}</span>
              <span className="text-fg-3">발언 {s.count}개</span>
            </p>
            <p className="mt-1 text-sm break-words text-fg-2">{s.first ? `“${s.first}”` : "내용 없음"}</p>
            {isFew(s) && (
              <p className="mt-2 text-xs text-fg-3">
                {s.count}줄뿐이라 인식 오류일 수 있어요. 진행자로 고르면 원문은 남고 근거에서만 빠져요.
              </p>
            )}
            <div className="mt-3">
              <SegmentedControl
                size="large"
                name={`role-${s.key}`}
                value={roles[s.key]}
                onValueChange={(v) => setRoles((r) => ({ ...r, [s.key]: v as Role }))}
              >
                <SegmentedControlItem className="tap-y" value="moderator">진행자</SegmentedControlItem>
                <SegmentedControlItem className="tap-y" value="participant">참가자</SegmentedControlItem>
              </SegmentedControl>
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-1 text-sm text-fg-2" aria-live="polite">
        <p>
          진행자 {sum.moderators}명 · 참가자 {sum.participants}명 (참가자는 한 사람으로 합쳐서 저장해요)
        </p>
        {sum.moderatorUtterances > 0 && <p>진행자로 고른 발언 {sum.moderatorUtterances}개는 근거로 쓰지 않아요.</p>}
      </div>

      {problems.length > 0 && (
        <div role="alert">
          <SectionMessage variant="cautionary" description={problems.map((p) => p.message).join(" ")}>
            이 역할로는 저장할 수 없어요.
          </SectionMessage>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button className="tap" size="medium" disabled={problems.length > 0} onClick={() => onSave(roles)}>
            {saveLabel}
          </Button>
          <p className="min-w-0 flex-1 basis-48 text-xs text-fg-3">저장하면 바꿀 수 없어요. 다르면 지우고 다시 올려야 해요.</p>
        </div>
        <TextButton className="tap" size="medium" color="assistive" onClick={onSkip}>
          {skipLabel}
        </TextButton>
      </div>
    </section>
  );
}
