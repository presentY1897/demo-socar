/** 단위 테스트 (DB 불필요) */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^@socar/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
};
