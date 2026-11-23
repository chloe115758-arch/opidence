import { FallbackView, FallbackViewContent, FallbackViewText } from "@montage-ui/core";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";

// 없는 주소 전체. Next의 기본 영어 404 화면 대신 한국어 안내와 목록으로 돌아가는 링크를 보여 준다.
export default function NotFound() {
  return (
    <section className="flex justify-center rounded-2xl border border-dashed border-line-strong px-5">
      <FallbackView padding="compact">
        <FallbackViewContent>
          <LogoMark size={40} className="mx-auto mb-3" />
          <FallbackViewText title="페이지를 찾을 수 없어요" description="주소가 잘못됐거나 옮겨진 페이지예요. 전사본 목록에서 다시 시작해 주세요." />
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
            전사본 목록으로 돌아가기
          </Link>
        </FallbackViewContent>
      </FallbackView>
    </section>
  );
}
