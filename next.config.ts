import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // 서버가 실행 중에 읽는 파일(샘플 인터뷰, 프롬프트)을 배포 묶음에 넣는다
  outputFileTracingIncludes: { "/": ["./data/interviews/interview_*.txt"], "/insights": ["./prompts/*.md"] },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
