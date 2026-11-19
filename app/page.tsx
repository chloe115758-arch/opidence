import Link from "next/link";
import { loadSamples, remove } from "@/app/actions";
import { ActionButton, UploadForm } from "@/components/Upload";
import { listTranscripts } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const list = await listTranscripts(await createClient());

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">전사본</h1>
        <p className="mt-2 text-gray-600">인터뷰 전사본을 올리면 발언 ID별로 나누어 저장합니다.</p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <label htmlFor="file" className="font-medium">
          전사본 올리기
        </label>
        <UploadForm />
        <ul className="mt-4 space-y-1 text-sm text-gray-600">
          <li>txt 파일, 파일당 10,000자, 최대 10건까지 올릴 수 있습니다.</li>
          <li>연락처·이메일 형태가 있으면 올리기 전에 알려 드립니다.</li>
          <li className="font-medium text-gray-900">본문의 이름은 직접 확인해 주세요. 이름은 자동으로 찾지 못합니다.</li>
        </ul>
      </section>

      {list.length === 0 ? (
        <section className="rounded-xl border border-dashed border-gray-300 px-6 py-14 text-center">
          <h2 className="font-medium">아직 전사본이 없습니다</h2>
          <p className="mt-2 text-sm text-gray-600">
            직접 올리거나, 가상 인터뷰 8건(공공자전거 앱 이용 경험)으로 바로 시작할 수 있습니다.
          </p>
          <ActionButton
            action={loadSamples}
            pendingLabel="불러오는 중…"
            className="mt-6 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            샘플 인터뷰 8건 불러오기
          </ActionButton>
        </section>
      ) : (
        <section>
          <h2 className="font-medium">올린 전사본 {list.length}건</h2>
          <ul className="mt-4 divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
            {list.map((t) => (
              <li key={t.label} className="px-6 py-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <Link href={`/transcripts/${t.label}`} className="font-medium text-accent underline">
                    참가자 {t.label}
                  </Link>
                  <span className="min-w-0 break-words text-sm text-gray-600">{t.meta}</span>
                  <span className="ml-auto text-sm text-gray-500">
                    발언 {t.total}개 · 참가자 발언 {t.participant}개
                  </span>
                  <ActionButton
                    action={remove.bind(null, t.label)}
                    pendingLabel="지우는 중…"
                    confirm={`참가자 ${t.label} 전사본과 발언 ${t.total}개를 지울까요? 되돌릴 수 없습니다.`}
                    className="text-sm text-gray-500 underline hover:text-gray-900"
                  >
                    지우기
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
