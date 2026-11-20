import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Opidence",
  description: "인터뷰 인사이트마다 원문 근거를 붙여 정리합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Montage의 기본 글꼴 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          crossOrigin=""
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-jp-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full bg-surface font-sans text-fg">
        <Providers>
          <header className="border-b border-line bg-surface">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-1 px-5 pt-3 sm:px-6">
              <Logo />
              <Suspense>
                <Nav />
              </Suspense>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-5 py-10 sm:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
