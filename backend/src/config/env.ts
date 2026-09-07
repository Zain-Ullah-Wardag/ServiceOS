import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env BEFORE validating process.env
dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z
    .string()
    .min(1, 'JWT_SECRET is required'),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(4000),

  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  FRONTEND_URL: z
    .string()
    .url()
    .default('http://localhost:5173'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const message = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');

  console.error(`Environment validation failed: ${message}`);

  process.exit(1);
}

export const env = result.data;