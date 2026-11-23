import { Button, ContentBadge, TextButton, TextField, Typography } from "@montage-ui/core";
import Link from "next/link";
import type { ReactNode } from "react";
import { EXAMPLES } from "./examples";
import { Quote } from "./Quote";

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

// 주제 분류의 분석 영역. components/Analyze.tsx와 같은 구조를 써서 같은 높이를 잡는다.
export function AnalyzeSkeleton() {
  return (
    <div role="status" aria-busy="true" className="w-full space-y-3">
      <Status label="분석 영역을 불러오는 중…" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Bone>
          <Button size="medium">다시 분석하기</Button>
        </Bone>
        <p className="text-sm text-fg-2">
          <Bone>오늘 남은 분석 10회 · 하루 10회예요. 자정에 다시 채워져요</Bone>
        </p>
      </div>
      <div />
    </div>
  );
}

const SAMPLE_QUOTE = {
  id: "A-01",
  status: "verified",
  utterance: { id: "A-01", label: "A", seq: 1, role: "participant", text: "출퇴근할 때 거의 매일 써요. 집에서 지하철역까지 걸으면 15분인데 자전거로 가면 5분이면 가니까요.", },
} as const;

// 주제 분류의 묶음 카드. app/insights/page.tsx의 카드와 같은 구조를 쓴다(인용 카드는 실제 Quote를 보이지 않게 그려 높이를 빌린다).
// 카드가 화면 맨 아래라 개수와 길이가 달라도 아래 요소는 밀리지 않는다.
export function InsightListSkeleton() {
  return (
    <>
      {[0, 1].map((i) => (
        <section key={i} role="status" aria-busy="true" className="rounded-2xl border border-line bg-surface p-6">
          <Status label="묶음을 불러오는 중…" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Typography as="h2" variant="headline1" weight="bold">
              <Bone>묶음 제목이 들어올 자리예요</Bone>
            </Typography>
            <Bone>
              <ContentBadge size="small" variant="outlined" color="neutral">
                근거 4개
              </ContentBadge>
            </Bone>
          </div>
          <p className="mt-2 break-words text-fg-2">
            <Bone className="block w-full">묶음 요약이 들어올 자리예요. 비슷한 발언을 묶은 두 문장 정도의 요약입니다.</Bone>
          </p>
          <div className="mt-5 space-y-3">
            <Bone className="block w-full">
              <Quote checked={SAMPLE_QUOTE} />
            </Bone>
          </div>
        </section>
      ))}
    </>
  );
}

// 검색 · 찾기의 입력 줄과 안내. components/Search.tsx의 위쪽(입력 칸, 예시, 남은 횟수)과 같은 구조를 쓴다.
export function SearchSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <Status label="검색 화면을 불러오는 중…" />
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <Bone className="block w-full">
            <TextField readOnly placeholder="예: 이용하면서 불편했던 점은 무엇인가요? (200자까지)" />
          </Bone>
        </div>
        <Bone>
          <Button size="large">찾기</Button>
        </Bone>
      </div>
      <div className="space-y-2 text-sm">
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-fg-3">
          <Bone>예시:</Bone>
          {EXAMPLES.map((x) => (
            <Bone key={x}>
              <span className="font-medium">{x}</span>
            </Bone>
          ))}
        </p>
        <p className="text-fg-2">
          <Bone>오늘 남은 검색 30회 · 하루 30회예요. 자정에 다시 채워져요</Bone>
        </p>
      </div>
      <div />
    </div>
  );
}

// 원문 보기. app/transcripts/[label]/page.tsx와 같은 구조를 쓴다. 되돌아가는 링크는 데이터가 필요 없어 그대로 그린다.
export function TranscriptSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <Status label="전사본을 불러오는 중…" />
      <div>
        <Link href="/" className="text-sm font-medium text-fg-3 hover:text-fg">
          ← 전사본 목록
        </Link>
        <Typography as="h1" variant="title3" weight="bold" display="block" sx={{ marginTop: 8 }}>
          <Bone>참가자 A</Bone>
        </Typography>
        <p className="mt-2 break-words text-fg-2">
          <Bone>가상 | 20대 후반 | 직장인 | 이용 빈도: 주 5회</Bone>
        </p>
      </div>
      <ol className="space-y-1 rounded-2xl border border-line bg-surface p-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <li key={i} className="rounded-xl py-3 pr-4 pl-5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3">
              <Bone>
                <span className="font-mono">A-01</span>
              </Bone>
              <Bone>참가자 A</Bone>
            </p>
            <p className="mt-1 break-words text-fg">
              <Bone className="block w-full">출퇴근할 때 거의 매일 써요. 집에서 지하철역까지 걸으면 15분인데 자전거로 가면 5분이면 가니까요.</Bone>
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
