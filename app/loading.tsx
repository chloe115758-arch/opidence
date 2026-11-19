import { Loading } from "@montage-ui/core";

export default function LoadingPage() {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-20 text-sm text-fg-3">
      <Loading variant="circular" size={28} />
      불러오는 중…
    </div>
  );
}
