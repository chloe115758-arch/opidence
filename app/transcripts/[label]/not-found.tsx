import { FallbackView, FallbackViewContent, FallbackViewText } from "@montage-ui/core";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";

// 없는 전사본 주소(/transcripts/Z)나 지운 전사본. 오류가 아니라 정상 상태라 오류 색을 쓰지 않고 목록으로 돌아가는 길을 준다.
export default function TranscriptNotFound() {
  return (
    <section className="flex justify-center rounded-2xl border border-dashed border-line-strong px-5">
      <FallbackView padding="compact">
        <FallbackViewContent>
          <LogoMark size={40} className="mx-auto mb-3" />
          <FallbackViewText
            title="이 전사본을 찾을 수 없어요"
            description="주소가 잘못됐거나 이미 지운 전사본이에요. 전사본 목록에서 다시 골라 주세요."
          />
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
            전사본 목록으로 돌아가기
          </Link>
        </FallbackViewContent>
      </FallbackView>
    </section>
  );
}
