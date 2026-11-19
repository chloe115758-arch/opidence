"use client";

import { Tab, TabList, TabListItem } from "@montage-ui/core";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "전사본" },
  { href: "/insights", label: "주제 묶음" },
  { href: "/ask", label: "질문·답변" },
];

export function Nav() {
  const pathname = usePathname();
  // 근거 보기(/transcripts/…)는 전사본 메뉴에 속한다
  const active = items.findLast(({ href }) => pathname.startsWith(href))!.href;
  return (
    <nav aria-label="주 메뉴">
      <Tab value={active}>
        <TabList size="medium" resize="hug">
          {items.map(({ href, label }) => (
            <TabListItem key={href} value={href} as={Link} href={href} aria-current={href === active ? "page" : undefined}>
              {label}
            </TabListItem>
          ))}
        </TabList>
      </Tab>
    </nav>
  );
}
