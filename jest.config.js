export default {
  testEnvironment: 'node',
  transform: {},
  moduleDirectories: ['node_modules', 'backend/node_modules'],
  setupFilesAfterEnv: ['./tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/backend/tests/'],
  testTimeout: 60000,
  verbose: true,
};
