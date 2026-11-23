import { ContentBadge, FallbackView, FallbackViewActionArea, FallbackViewContent, FallbackViewText, Typography } from "@montage-ui/core";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { loadSamples, remove } from "@/app/actions";
import { LogoMark } from "@/components/Logo";
import { TranscriptListSkeleton, UploadBoxSkeleton } from "@/components/Skeletons";
import { ActionButton, UploadForm } from "@/components/Upload";
import { getTranscripts } from "@/lib/data";
import { MAX_CHARS, MAX_TRANSCRIPTS } from "@/lib/transcript";

// 제목과 안내(규칙)는 데이터가 없어도 바로 그린다. 로그인 세션을 확인하는 부분(남은 자리, 목록)만 Suspense 안에서 읽는다.
// 각 구역은 맨 앞에서 connection()을 기다려 "요청이 올 때 그리는 부분"임을 알린다(개발 서버의 Date.now() 경고를 없앤다).
export default function Home() {
  return (
    <div className="space-y-8">
      <div>
        <Typography as="h1" variant="title3" weight="bold" display="block">
          전사본
        </Typography>
        <p className="mt-2 text-fg-2">인터뷰 전사본을 올리면 발언마다 번호를 붙여 저장합니다.</p>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <Typography as="h2" variant="headline2" weight="bold" display="block">
          전사본 올리기
        </Typography>
        <ul className="mt-2 space-y-1 text-sm text-fg-2">
          <li>
            txt 파일, 파일당 {MAX_CHARS.toLocaleString()}자, 최대 {MAX_TRANSCRIPTS}건까지 올릴 수 있습니다.
          </li>
          <li>연락처·이메일 형태가 있으면 올리기 전에 알려 드립니다.</li>
          <li className="font-semibold text-fg">본문의 이름은 직접 확인해 주세요. 이름은 자동으로 찾지 못합니다.</li>
        </ul>
        {/* 형식 안내는 접어 두어 위쪽 설명이 길어지지 않게 한다 */}
        <details className="mt-3 mb-5 text-sm">
          <summary className="cursor-pointer font-medium text-accent hover:underline">전사본 형식 보기 (번호를 직접 붙이지 않아도 됩니다)</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-2">
            <li>줄마다 화자를 앞에 쓰면 발언 번호는 순서대로 붙습니다. 예: <span className="font-mono">진행자: 질문</span>, <span className="font-mono">참가자: 답변</span></li>
            <li>진행자는 진행자·인터뷰어·모더레이터·Q, 참가자는 참가자·응답자·A로 알아봅니다. 진행자가 있으면 나머지 한 사람(이름 등)은 참가자로 봅니다.</li>
            <li>자동으로 정리하는 것: 번호 붙이기, 시간 표시(00:01:23) 지우기, 화자 없는 줄을 앞 발언에 잇기, 머리말 줄 제외. 발언 글자는 바꾸지 않고, 정리한 내용은 저장 결과에 알려 드립니다.</li>
            <li>화자가 3명 이상이거나 진행자와 참가자를 구분할 수 없으면 저장하지 않고 이유를 알려 드립니다.</li>
            <li>이미 <span className="font-mono">A-01 진행자: 질문</span>처럼 번호가 있는 파일도 그대로 올릴 수 있습니다.</li>
          </ul>
        </details>
        <Suspense fallback={<UploadBoxSkeleton />}>
          <UploadBox />
        </Suspense>
      </section>

      <Suspense fallback={<TranscriptListSkeleton />}>
        <TranscriptList />
      </Suspense>
    </div>
  );
}

async function UploadBox() {
  await connection();
  const list = await getTranscripts();
  return <UploadForm remaining={Math.max(0, MAX_TRANSCRIPTS - list.length)} />;
}

async function TranscriptList() {
  await connection();
  const list = await getTranscripts();
  return (
    <>
      {list.length === 0 ? (
        <section className="flex justify-center rounded-2xl border border-dashed border-line-strong px-5">
          <FallbackView padding="compact">
            <FallbackViewContent>
              <LogoMark size={40} className="mx-auto mb-3" />
              <FallbackViewText
                title="아직 전사본이 없습니다"
                description="직접 올리거나, 가상 인터뷰 8건(공공자전거 앱 이용 경험)으로 바로 시작할 수 있습니다."
              />
            </FallbackViewContent>
            <FallbackViewActionArea variant="vertical" sx={{ marginTop: 16, alignItems: "center" }}>
              <ActionButton action={loadSamples}>샘플 인터뷰 8건 불러오기</ActionButton>
            </FallbackViewActionArea>
          </FallbackView>
        </section>
      ) : (
        <section>
          <Typography as="h2" variant="headline2" weight="bold" display="block">
            올린 전사본 {list.length}건
          </Typography>
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {list.map((t) => (
              <li key={t.label} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
                <Link href={`/transcripts/${t.label}`} className="font-semibold text-accent hover:underline">
                  참가자 {t.label}
                </Link>
                <span className="min-w-0 break-words text-sm text-fg-2">{t.meta}</span>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <ContentBadge size="small" variant="solid" color="neutral">
                    발언 {t.total}개
                  </ContentBadge>
                  <ContentBadge size="small" variant="solid" color="accent" accentColor="semantic.foreground.brand.primary">
                    참가자 발언 {t.participant}개
                  </ContentBadge>
                  <ActionButton
                    variant="text"
                    action={remove.bind(null, t.label)}
                    confirm={`참가자 ${t.label} 전사본과 발언 ${t.total}개를 지울까요? 되돌릴 수 없습니다.`}
                  >
                    지우기
                  </ActionButton>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
