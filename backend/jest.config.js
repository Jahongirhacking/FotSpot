/**
 * Jest per backend/CLAUDE.md 8 (NestJS default tooling - not Vitest).
 *
 * Unit specs live beside the code they cover (`*.spec.ts`); e2e specs belong in a
 * top-level `test/` dir run against a throwaway Postgres, and are excluded here so
 * `pnpm test` stays runnable without any infrastructure.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
