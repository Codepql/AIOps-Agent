import { describe, expect, it, vi } from 'vitest';

const connect = vi.fn();
const disconnect = vi.fn();
const queryRaw = vi.fn();

vi.mock('../src/generated/prisma/client.js', () => ({
  PrismaClient: class {
    $connect = connect;
    $disconnect = disconnect;
    $queryRaw = queryRaw;
  },
}));

vi.mock('../src/config.js', () => ({
  config: { databaseUrl: 'postgresql://localhost/test', databaseSsl: false },
}));

describe('DatabaseManager', () => {
  it('connects through Prisma without creating tables at runtime', async () => {
    const { DatabaseManager } = await import('../src/core/database.js');
    await new DatabaseManager().initialize();

    expect(connect).toHaveBeenCalledOnce();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
