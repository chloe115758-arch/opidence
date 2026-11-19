import { ContentBadge, FallbackView, FallbackViewActionArea, FallbackViewContent, FallbackViewText, Typography } from "@montage-ui/core";
import Link from "next/link";
import { loadSamples, remove } from "@/app/actions";
import { ActionButton, UploadForm } from "@/components/Upload";
import { listTranscripts } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const list = await listTranscripts(await createClient());

  return (
    <div className="space-y-8">
      <div>
        <Typography as="h1" variant="title3" weight="bold" display="block">
          전사본
        </Typography>
        <p className="mt-2 text-fg-2">인터뷰 전사본을 올리면 발언 ID별로 나누어 저장합니다.</p>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <Typography as="h2" variant="headline2" weight="bold" display="block">
          전사본 올리기
        </Typography>
        <ul className="mt-2 mb-5 space-y-1 text-sm text-fg-2">
          <li>txt 파일, 파일당 10,000자, 최대 10건까지 올릴 수 있습니다.</li>
          <li>연락처·이메일 형태가 있으면 올리기 전에 알려 드립니다.</li>
          <li className="font-semibold text-fg">본문의 이름은 직접 확인해 주세요. 이름은 자동으로 찾지 못합니다.</li>
        </ul>
        <UploadForm />
      </section>

      {list.length === 0 ? (
        <section className="flex justify-center rounded-2xl border border-dashed border-line-strong px-5">
          <FallbackView padding="compact">
            <FallbackViewContent>
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
    </div>
  );
}
