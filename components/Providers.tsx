"use client";

import { ThemeProvider } from "@montage-ui/core";
import { AppRouterCacheProvider } from "@montage-ui/nextjs";
import type { ReactNode } from "react";

// Montage 컴포넌트의 테마와 스타일(Emotion)을 서버 렌더링에 연결한다. 다크 모드는 켜지 않는다.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AppRouterCacheProvider>{children}</AppRouterCacheProvider>
    </ThemeProvider>
  );
}
