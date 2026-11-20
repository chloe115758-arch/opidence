import { Quicksand } from "next/font/google";
import Link from "next/link";

// 로고 글자에만 쓰는 글꼴. 본문 글꼴(Pretendard)은 건드리지 않는다.
const quicksand = Quicksand({ subsets: ["latin"], weight: "600", display: "swap" });

// 심볼: logo-mark.svg와 같은 그림. 앱은 라이트 모드만 쓰므로 어두운 모드 규칙은 넣지 않는다
// (넣으면 OS가 어두울 때 흰 바탕에 밝은 선이 된다). 파란 점은 --color-accent를 그대로 따른다.
// clipPath id가 화면에 여러 개 있어도 모양이 같아서 어느 것을 가리켜도 같다.
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false" className={className}>
      <defs>
        <clipPath id="above-rim">
          <path d="M0 0 H64 V52 H50 A20 7 0 0 1 10 52 H0 Z" />
        </clipPath>
      </defs>
      <ellipse cx="30" cy="52" rx="20" ry="7" fill="#C9CDD2" stroke="var(--color-fg)" strokeWidth="2.5" />
      <path d="M42 34 C48 31 51 25 51 17" fill="none" stroke="var(--color-fg)" strokeWidth="9" strokeLinecap="round" />
      <g clipPath="url(#above-rim)">
        <path
          d="M19 62 C18 46 16 28 27 21 C37 15 46 24 44 34 C43 42 40 47 40 62 Z"
          fill="var(--color-surface)"
          stroke="var(--color-fg)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </g>
      <path d="M42 34 C48 31 51 25 51 17" fill="none" stroke="var(--color-surface)" strokeWidth="4" strokeLinecap="round" />
      <path d="M10 52 A20 7 0 0 0 50 52" fill="none" stroke="var(--color-fg)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="28" cy="31" r="1.9" fill="var(--color-fg)" />
      <circle cx="36" cy="30" r="1.9" fill="var(--color-fg)" />
      <circle cx="52" cy="8" r="4.5" style={{ fill: "var(--color-accent)" }} />
    </svg>
  );
}

// 상단 메뉴의 로고: 심볼 + 실제 글자(SVG <text> 아님)
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 pb-3">
      <LogoMark size={30} />
      <span className={`${quicksand.className} text-xl font-semibold tracking-[-0.01em]`}>Opidence</span>
    </Link>
  );
}
