import { config } from 'dotenv';
import { resolve } from 'node:path';

interface LoadLocalDatabaseEnvOptions {
   cwd?: string;
   environment?: NodeJS.ProcessEnv;
}

export function loadLocalDatabaseEnv({
   cwd = process.cwd(),
   environment = process.env,
}: LoadLocalDatabaseEnvOptions = {}): void {
   if (environment.DATABASE_URL) return;

   config({
      path: resolve(cwd, '.env.local'),
      processEnv: environment,
      override: false,
      quiet: true,
   });
}
