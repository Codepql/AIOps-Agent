import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '../config.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { logger } from '../logger.js';

export const VECTOR_DIM = 1024;

export class DatabaseManager {
  readonly prisma: PrismaClient;
  private initialized = false;

  constructor() {
    const adapter = new PrismaPg({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 3000,
    });
    this.prisma = new PrismaClient({ adapter });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.prisma.$connect();
    this.initialized = true;
    logger.info('PostgreSQL pgvector knowledge base connected');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ ready: boolean }>>`
        SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
          AND to_regclass('public.knowledge_chunks') IS NOT NULL AS ready
      `;
      return rows[0]?.ready === true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
    this.initialized = false;
  }
}

export const databaseManager = new DatabaseManager();
