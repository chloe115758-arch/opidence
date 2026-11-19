"use client";

// B안에서 답변 문장 옆에 붙는 번호. 누르면 같은 번호의 원문 카드를 선택한다.
export function CiteLink({ n }: { n: number }) {
  return (
    <a
      href={`#cite-${n}`}
      aria-label={`근거 ${n} 보기`}
      className="ml-1 rounded-md bg-accent px-1.5 py-0.5 align-text-top text-xs font-semibold text-white"
      onClick={(e) => {
        e.preventDefault();
        const { scrollX, scrollY } = window;
        location.hash = `cite-${n}`; // 선택 강조(:target)는 주소의 #이 바뀌어야 켜진다
        window.scrollTo(scrollX, scrollY); // 브라우저가 카드를 화면 맨 위로 끌어올린 것을 되돌린다
        // 카드가 이미 보이면 움직이지 않고, 안 보일 때만 보일 만큼 움직인다
        document.getElementById(`cite-${n}`)?.scrollIntoView({ block: "nearest" });
      }}
    >
      {n}
    </a>
  );
}
