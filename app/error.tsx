"use client";

import { FallbackView, FallbackViewActionArea, FallbackViewActionAreaButton, FallbackViewContent, FallbackViewText } from "@montage-ui/core";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <section className="flex justify-center rounded-2xl border border-line px-5">
      <FallbackView padding="compact">
        <FallbackViewContent>
          <FallbackViewText
            title="화면을 불러오지 못했습니다"
            description="인터넷 연결을 확인한 뒤 다시 시도해 주세요. 저장된 전사본은 그대로 있습니다."
          />
        </FallbackViewContent>
        <FallbackViewActionArea>
          <FallbackViewActionAreaButton onClick={() => retry()}>다시 시도</FallbackViewActionAreaButton>
        </FallbackViewActionArea>
      </FallbackView>
    </section>
  );
}
