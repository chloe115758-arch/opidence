import Link from "next/link";
import { transcripts } from "@/lib/mock";

export default async function Home({ searchParams }: { searchParams: Promise<{ empty?: string }> }) {
  // 뼈대 단계에서 빈 상태를 보려고 둔 스위치(/?empty). 2단계에서 실제 목록으로 바꾼다.
  const list = (await searchParams).empty === undefined ? transcripts : [];

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
        {/* 업로드는 2단계에서 연결한다 */}
        <input
          id="file"
          type="file"
          accept=".txt"
          disabled
          className="mt-3 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-accent file:px-4 file:py-2 file:text-white disabled:opacity-60"
        />
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
          <Link href="/" className="mt-6 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">
            샘플 인터뷰 8건 불러오기
          </Link>
        </section>
      ) : (
        <section>
          <h2 className="font-medium">올린 전사본 {list.length}건</h2>
          <ul className="mt-4 divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
            {list.map((t) => (
              <li key={t.label}>
                <Link href={`/transcripts/${t.label}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-4 hover:bg-gray-50">
                  <span className="font-medium">참가자 {t.label}</span>
                  <span className="text-sm text-gray-600">{t.meta}</span>
                  <span className="ml-auto text-sm text-gray-500">
                    발언 {t.utterances.length}개 · 참가자 발언 {t.utterances.filter((u) => u.role === "participant").length}개
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/?empty" className="mt-4 inline-block text-xs text-gray-500 underline">
            빈 상태 미리 보기
          </Link>
        </section>
      )}
    </div>
  );
}
