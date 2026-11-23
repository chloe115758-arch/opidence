import { Button, ContentBadge, TextButton, Typography } from "@montage-ui/core";
import type { ReactNode } from "react";

// 로딩 자리(뼈대). 두 가지 원칙을 지킨다.
// 1) 회색(중립색)만 쓴다. 파란색(강조색)은 근거를 뜻하므로 로딩 자리에 쓰지 않는다.
// 2) 실제 내용과 같은 크기를 잡는다. Bone은 children을 보이지 않게 그려 크기만 빌리고 그 위에 회색 막대를 얹는다.
//    그래서 내용이 들어와도 아래 요소가 밀려 내려가지 않는다. 움직임을 줄인 설정에서는 깜빡이지 않는다.
export function Bone({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <span aria-hidden="true" className={`relative inline-block max-w-full align-top ${className}`}>
      <span className="invisible">{children}</span>
      <span className="absolute inset-0 rounded-md bg-fill motion-safe:animate-pulse" />
    </span>
  );
}

// 스크린 리더에는 "불러오는 중"만 알린다(막대는 읽지 않는다).
const Status = ({ label }: { label: string }) => <span className="sr-only">{label}</span>;

// 업로드 칸. components/Upload.tsx의 UploadForm과 같은 구조·글자 크기를 써서 같은 높이를 잡는다(구조를 바꾸면 이쪽도 맞춘다).
export function UploadBoxSkeleton() {
  return (
    <div role="status" aria-busy="true" className="rounded-2xl border-2 border-dashed border-line-strong px-5 py-5 text-center">
      <Status label="업로드 칸을 불러오는 중…" />
      <p className="text-sm text-fg-2">
        <Bone>여기에 끌어다 놓거나 아래 버튼으로 고르세요.</Bone>
      </p>
      <p className="mt-1 mb-3 text-xs text-fg-3">
        <Bone>9건 더 올릴 수 있습니다</Bone>
      </p>
      <Bone>
        <Button size="medium">txt 파일 선택</Button>
      </Bone>
      <div className="mt-3 w-full text-left" />
    </div>
  );
}

// 올린 전사본 목록. app/page.tsx의 목록과 같은 행 구조를 쓴다. 목록이 화면의 맨 아래라 행 수가 달라도 아래 요소는 밀리지 않는다.
export function TranscriptListSkeleton() {
  return (
    <section role="status" aria-busy="true">
      <Status label="전사본 목록을 불러오는 중…" />
      <Typography as="h2" variant="headline2" weight="bold" display="block">
        <Bone>올린 전사본 8건</Bone>
      </Typography>
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
            <Bone>
              <span className="font-semibold">참가자 A</span>
            </Bone>
            <Bone className="min-w-0">
              <span className="text-sm">가상 | 20대 후반 | 직장인 | 이용 빈도: 주 5회</span>
            </Bone>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <Bone>
                <ContentBadge size="small" variant="solid" color="neutral">
                  발언 16개
                </ContentBadge>
              </Bone>
              <Bone>
                <ContentBadge size="small" variant="solid" color="neutral">
                  참가자 발언 8개
                </ContentBadge>
              </Bone>
              <Bone>
                <TextButton size="small" color="assistive">
                  지우기
                </TextButton>
              </Bone>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
