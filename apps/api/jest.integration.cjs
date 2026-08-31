/** 통합 테스트 (로컬 PostgreSQL 필요 — pnpm db:up 후 실행) */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.int-spec.ts'],
  moduleNameMapper: {
    '^@socar/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  testTimeout: 30000,
};
