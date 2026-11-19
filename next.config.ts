import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // 샘플 불러오기가 읽는 파일을 배포 묶음에 넣는다
  outputFileTracingIncludes: { "/": ["./data/interviews/interview_*.txt"] },
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
