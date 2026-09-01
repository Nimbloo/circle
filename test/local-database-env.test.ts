import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalDatabaseEnv } from '../db/load-local-env';

describe('loadLocalDatabaseEnv', () => {
   const directories: string[] = [];

   afterEach(async () => {
      await Promise.all(
         directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
      );
   });

   it('carrega DATABASE_URL do .env.local quando o processo não recebeu a variável', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'circle-env-'));
      directories.push(cwd);
      await writeFile(join(cwd, '.env.local'), 'DATABASE_URL=postgres://local/circle\n');
      const environment: NodeJS.ProcessEnv = { NODE_ENV: 'test' };

      loadLocalDatabaseEnv({ cwd, environment });

      expect(environment.DATABASE_URL).toBe('postgres://local/circle');
   });

   it('preserva DATABASE_URL injetada pelo ambiente', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'circle-env-'));
      directories.push(cwd);
      await writeFile(join(cwd, '.env.local'), 'DATABASE_URL=postgres://local/circle\n');
      const environment: NodeJS.ProcessEnv = {
         NODE_ENV: 'test',
         DATABASE_URL: 'postgres://runtime/circle',
      };

      loadLocalDatabaseEnv({ cwd, environment });

      expect(environment.DATABASE_URL).toBe('postgres://runtime/circle');
   });
});
