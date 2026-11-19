"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "전사본" },
  { href: "/insights", label: "주제 묶음" },
  { href: "/ask", label: "질문·답변" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 text-sm">
      {items.map(({ href, label }) => {
        // 근거 보기(/transcripts/…)는 전사본 메뉴에 속한다
        const active = href === "/" ? pathname === "/" || pathname.startsWith("/transcripts") : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 ${active ? "bg-accent-soft font-medium text-accent" : "text-gray-600 hover:text-gray-900"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
