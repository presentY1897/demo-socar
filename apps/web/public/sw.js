/* 최소 서비스워커 — 설치형 PWA 요건 충족 + 정적 자원 캐시 */
const CACHE = 'mocar-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // API/SSE는 항상 네트워크
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  // 정적 자원: cache-first
  if (url.pathname.startsWith('/_next/static') || url.pathname.match(/\.(svg|png|ico|webmanifest)$/)) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ??
          fetch(event.request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, clone));
            return res;
          }),
      ),
    );
  }
});
