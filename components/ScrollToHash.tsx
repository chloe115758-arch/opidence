"use client";

import { useEffect } from "react";

// 주소에 #발언번호가 있는데 본문이 스트리밍으로 늦게 들어와 브라우저가 스크롤하지 못하는 경우(링크를 새 탭으로 열었을 때)를 보완한다.
// 앱 안 이동은 Next가 이미 스크롤한다. 같은 자리로 한 번 더 가는 것이라 어긋나지 않는다.
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);
  return null;
}
