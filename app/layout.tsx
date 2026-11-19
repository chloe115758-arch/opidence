import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Opidence",
  description: "인터뷰 인사이트마다 원문 근거를 붙여 정리합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-gray-50 text-gray-900">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-2 px-6 py-4">
            <Link href="/" className="text-lg font-semibold">
              Opidence
            </Link>
            <Suspense>
              <Nav />
            </Suspense>
          </div>
        </header>
        {/* 2단계에서 실제 데이터로 바꾸면 이 줄을 지운다 */}
        <p className="bg-gray-100 px-6 py-2 text-center text-xs text-gray-500">
          화면 뼈대입니다. 지금 보이는 내용은 가짜 데이터(도서관 좌석 예약 앱)입니다.
        </p>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
