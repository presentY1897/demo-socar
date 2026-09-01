import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // 워크스페이스 패키지는 빌드 산출물(dist) 대신 소스를 직접 본다 —
      // shared를 고치고 web 테스트를 돌릴 때 빌드 순서에 묶이지 않게.
      '@socar/shared': new URL('../../packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    unstubGlobals: true,
  },
});
