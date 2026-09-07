import { config } from 'dotenv';

// Load dedicated test environment first.
config({ path: '.env.test', override: true });

const testDbUrl = process.env.DATABASE_URL_TEST;

if (!testDbUrl) {
  throw new Error(
    'DATABASE_URL_TEST must be set. Integration tests will not run without a dedicated test database.'
  );
}

// Require an explicitly named test database.
let databaseName = '';

try {
  const parsed = new URL(testDbUrl);
  databaseName = parsed.pathname.replace(/^\//, '').split('?')[0];
} catch {
  throw new Error('DATABASE_URL_TEST is not a valid PostgreSQL connection URL.');
}

if (databaseName !== 'serviceos_test') {
  throw new Error(
    `Refusing to run tests against database "${databaseName}". DATABASE_URL_TEST must point to "serviceos_test".`
  );
}

// Make the application and Prisma use the TEST database.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDbUrl;

// Safe test defaults.
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'serviceos-local-integration-test-secret';

process.env.PORT = process.env.PORT || '4001';
process.env.FRONTEND_URL =
  process.env.FRONTEND_URL || 'http://localhost:5173';

console.log('Integration test database safety check passed: serviceos_test');