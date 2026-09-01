import { defineConfig } from 'drizzle-kit';
import { loadLocalDatabaseEnv } from './db/load-local-env';

loadLocalDatabaseEnv();

export default defineConfig({
   schema: './db/schema.ts',
   out: './db/migrations',
   dialect: 'postgresql',
   dbCredentials: {
      url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/circle',
   },
});
