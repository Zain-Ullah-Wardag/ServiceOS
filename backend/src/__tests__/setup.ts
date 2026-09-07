import { config } from 'dotenv';
config({ path: '.env.test' })
config({ path: '.env', override: false });

const testDbUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;

if (!testDbUrl) {
  throw new Error('DATABASE_URL_TEST must be set for integration tests');
}

if (process.env.NODE_ENV !== 'test' && !testDbUrl.includes('serviceos_test')) {
  throw new Error('Integration tests must use a test database (serviceos_test). Set DATABASE_URL_TEST.');
}

if (testDbUrl.includes('serviceos') && !testDbUrl.includes('serviceos_test')) {
  throw new Error('Refusing to run integration tests against the development database. Set DATABASE_URL_TEST to serviceos_test.');
}

console.log('Test DB configured:', testDbUrl.replace(/\/\/[^:]+:[^@]+@/, '***@'));
