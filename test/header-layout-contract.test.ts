import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

const migratedHeaderFiles = [
   'components/layout/headers/agent/header.tsx',
   'components/layout/headers/cycle/header-nav.tsx',
   'components/layout/headers/cycle/header-options.tsx',
   'components/layout/headers/cycles/header-nav.tsx',
   'components/layout/headers/initiative/header.tsx',
   'components/layout/headers/initiatives/header.tsx',
   'components/layout/headers/issue/header-nav.tsx',
   'components/layout/headers/issues/header-nav.tsx',
   'components/layout/headers/issues/header-options.tsx',
   'components/layout/headers/members/header-nav.tsx',
   'components/layout/headers/members/header-options.tsx',
   'components/layout/headers/my-issues/header.tsx',
   'components/layout/headers/profile/header.tsx',
   'components/layout/headers/project/header.tsx',
   'components/layout/headers/projects/header-nav.tsx',
   'components/layout/headers/team/header-nav.tsx',
   'components/layout/headers/team/header-tabs.tsx',
   'components/layout/headers/team-projects/header.tsx',
   'components/layout/headers/team-views/header.tsx',
   'components/layout/headers/teams/header-nav.tsx',
   'components/layout/headers/view/header.tsx',
   'components/layout/headers/views/header.tsx',
];

describe('header layout contract', () => {
   it.each(migratedHeaderFiles)('%s não usa o chrome legado', (relativePath) => {
      const source = readFileSync(join(root, relativePath), 'utf8');

      expect(source).not.toContain('h-10');
      expect(source).not.toContain('px-6');
      expect(source).toMatch(/LocationBar|ViewBar/);
   });

   it('mantém Settings sem header global', () => {
      const settingsRoot = join(root, 'app/[orgId]/settings');
      const settingsPages = readdirSync(settingsRoot, { recursive: true })
         .filter((path): path is string => typeof path === 'string' && path.endsWith('page.tsx'))
         .map((path) => readFileSync(join(settingsRoot, path), 'utf8'));

      expect(settingsPages).not.toHaveLength(0);
      for (const source of settingsPages) {
         expect(source).not.toContain('headers/settings/header');
         expect(source).not.toContain('header={<Header />}');
      }
   });
});
