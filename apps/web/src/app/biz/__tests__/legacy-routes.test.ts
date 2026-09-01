import { describe, expect, it } from 'vitest';
import nextConfig from '../../../../next.config';

/**
 * 구 `/office` 경로는 M5-2에서 `/biz`로 옮겼다. 데모 링크·북마크가 깨지지 않도록
 * next.config의 리다이렉트를 계약으로 고정한다 (클라이언트 라우팅·직접 접근 모두 커버).
 */
describe('구 /office 경로 리다이렉트', () => {
  it('/office → /biz/dispatch, /office/board → /biz/board 로 영구 리다이렉트한다', async () => {
    const redirects = await nextConfig.redirects!();
    const bySource = new Map(redirects.map((r) => [r.source, r]));

    expect(bySource.get('/office')).toMatchObject({
      destination: '/biz/dispatch',
      permanent: true,
    });
    expect(bySource.get('/office/board')).toMatchObject({
      destination: '/biz/board',
      permanent: true,
    });
  });

  it('/biz 랜딩은 배차 화면으로 보낸다', async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects.find((r) => r.source === '/biz')).toMatchObject({
      destination: '/biz/dispatch',
    });
  });
});
