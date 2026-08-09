import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // URL used by Prisma CLI (migrate, db push). Not used at runtime — see src/database/prisma.ts
    url: process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/placeholder',
  },
});

