// 연결이 끊겼을 때의 안내. 화면(브라우저)이 서버 액션을 부르다 실패했을 때 쓴다.
// 브라우저 번들에 들어가는 파일이라 아주 작게 둔다: 개발 환경 안내(키·모델 이름·.env.local)가 있는 lib/failure.ts를 화면이 불러오면
// 그 글자가 번들에 실려 배포 화면에도 내려간다(보이지는 않아도 "원인은 서버 기록에만"이라는 원칙에 어긋난다). 문구 규칙은 docs/plan.md "6-4" 표 A1.
import type { Failure, Task } from "./failure.ts";

export function networkFailure(task: Task): Failure {
  const couldNot = task === "search" ? "찾지 못했어요" : "분석하지 못했어요";
  return { kind: "network", message: `연결이 끊겨서 ${couldNot}. 인터넷 연결을 확인하고 다시 시도해 주세요.`, retry: true, counted: null };
}
