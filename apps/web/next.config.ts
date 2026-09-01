import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@socar/shared'],
  /**
   * 법인 화면은 M5-2에서 `/office/*` → `/biz/*`(MOCAR 비즈니스)로 옮겼다.
   * 데모 링크·북마크가 깨지지 않도록 구 경로는 리다이렉트로 남긴다.
   */
  async redirects() {
    return [
      { source: '/office', destination: '/biz/dispatch', permanent: true },
      { source: '/office/board', destination: '/biz/board', permanent: true },
      // /biz 랜딩 — 이후 플릿/멤버 화면이 붙으면 허브 페이지로 바뀔 수 있어 임시 리다이렉트
      { source: '/biz', destination: '/biz/dispatch', permanent: false },
    ];
  },
};

export default nextConfig;
