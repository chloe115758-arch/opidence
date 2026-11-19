"use client";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <section className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
      <h1 className="font-medium">화면을 불러오지 못했습니다</h1>
      <p className="mt-2 text-sm text-gray-600">인터넷 연결을 확인한 뒤 다시 시도해 주세요. 저장된 전사본은 그대로 있습니다.</p>
      <button onClick={() => retry()} className="mt-6 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">
        다시 시도
      </button>
    </section>
  );
}
