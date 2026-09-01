import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
   readFileSync(join(process.cwd(), relativePath), 'utf8');

const SETTINGS_WITH_SWITCHES = [
   'components/common/settings/account-code-reviews.tsx',
   'components/common/settings/account-notifications.tsx',
   'components/common/settings/ai-agents.tsx',
   'components/common/settings/preferences.tsx',
   'components/common/settings/slack-events-config.tsx',
   'components/common/settings/theme-preferences.tsx',
];

const SETTINGS_WITH_SELECT_MENUS = [
   'components/common/settings/account-code-reviews.tsx',
   'components/common/settings/preferences.tsx',
];

describe('accessibility hardening contract', () => {
   it('respeita a preferência do sistema por movimento reduzido', () => {
      const globals = readSource('app/globals.css');

      expect(globals).toContain('@media (prefers-reduced-motion: reduce)');
      expect(globals).toContain('animation-duration: 0.01ms !important');
      expect(globals).toContain('transition-duration: 0.01ms !important');
   });

   it('mantém switches e selects de settings com nome acessível', () => {
      for (const file of SETTINGS_WITH_SWITCHES) {
         const switches = readSource(file).match(/<Switch\b[\s\S]*?\/>/g) ?? [];
         expect(switches.length, file).toBeGreaterThan(0);
         for (const control of switches) expect(control, file).toContain('aria-label=');
      }

      for (const file of SETTINGS_WITH_SELECT_MENUS) {
         const selects = readSource(file).match(/<SelectMenu\b[\s\S]*?\/>/g) ?? [];
         expect(selects.length, file).toBeGreaterThan(0);
         for (const control of selects) expect(control, file).toContain('ariaLabel=');
      }

      const shared = readSource('components/common/settings/shared.tsx');
      expect(shared).toContain('ariaLabel: string');
      expect(shared).toContain('aria-label={ariaLabel}');
   });

   it('oferece estados de erro consistentes e recuperáveis', () => {
      const rootError = readSource('app/error.tsx');
      const orgError = readSource('app/[orgId]/error.tsx');
      const notFound = readSource('app/not-found.tsx');
      const globalError = readSource('app/global-error.tsx');

      expect(rootError).toContain('<ErrorState');
      expect(rootError).toContain('reset()');
      expect(orgError).toContain('<ErrorState');
      expect(orgError).toContain('reset()');
      expect(notFound).toContain('<ErrorState');
      expect(notFound).not.toContain('redirect(');
      expect(globalError).toContain('lang="pt-BR"');
      expect(globalError).toContain('aria-labelledby="global-error-title"');
   });
});
