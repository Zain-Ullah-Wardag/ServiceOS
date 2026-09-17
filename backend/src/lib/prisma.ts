import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Optional driver-adapter mode.
 *
 * When PRISMA_DRIVER_ADAPTER=pg, the client runs on the @prisma/adapter-pg
 * driver adapter (query-compiler engine) instead of the native query
 * engine binary. This allows environments where the native engine binary
 * cannot be distributed (e.g. offline CI sandboxes). When the variable is
 * unset the classic engine path is used.
 */
const adapterConfig: Prisma.PrismaClientOptions | undefined =
  process.env.PRISMA_DRIVER_ADAPTER === 'pg'
    ? { adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) }
    : undefined;

const prisma = new PrismaClient(adapterConfig);

export default prisma;
