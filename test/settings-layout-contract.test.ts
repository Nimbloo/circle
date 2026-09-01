import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
   readFileSync(join(process.cwd(), relativePath), 'utf8');

describe('settings and overlays layout contract', () => {
   it('mantém o shell e os cards nas medidas observadas no Linear', () => {
      const shared = readSource('components/common/settings/shared.tsx');
      const profile = readSource('components/common/settings/profile.tsx');

      expect(shared).toContain('max-w-[640px]');
      expect(shared).toContain('py-16');
      expect(shared).toContain('px-4');
      expect(shared).toContain('mt-8 flex flex-col gap-12');
      expect(shared).toContain('leading-[22px]');
      expect(shared).toContain('rounded-[10px] bg-card');
      expect(shared).not.toContain('rounded-lg border bg-container');
      expect(shared).toContain('min-h-[60px]');
      expect(shared).toContain('py-[15.5px]');
      expect(shared).toContain('text-[13px] font-medium leading-4');
      expect(shared).toContain('bg-[var(--online-indicator)]');
      expect(shared).toContain('<Select');
      expect(shared).not.toContain('#00cc66');
      expect(profile).toContain('w-[180px]');
   });

   it('preserva as geometrias especiais confirmadas em labels, integrações e times', () => {
      const labels = readSource('components/common/settings/issue-labels-settings.tsx');
      const integrations = readSource('components/common/settings/integrations.tsx');
      const team = readSource('components/common/settings/team-settings.tsx');
      const emojis = readSource('components/common/settings/emojis-settings.tsx');

      expect(labels).toContain('px-14 py-16');
      expect(labels).not.toContain('max-w-5xl');
      expect(integrations).toContain('<SettingsShell');
      expect(integrations).toContain('grid-cols-3');
      expect(integrations).toContain('h-[382px]');
      expect(team).toContain('<SettingsShell');
      expect(team).not.toContain('max-w-2xl');
      expect(emojis).toContain('px-14 py-16');
      expect(emojis).toContain('Filter by name...');
      expect(emojis).not.toContain('<SettingsShell');
   });

   it('mantém controles e overlays no vocabulário visual do Linear', () => {
      const button = readSource('components/ui/button.tsx');
      const input = readSource('components/ui/input.tsx');
      const dialog = readSource('components/ui/dialog.tsx');
      const dropdown = readSource('components/ui/dropdown-menu.tsx');
      const popover = readSource('components/ui/popover.tsx');
      const select = readSource('components/ui/select.tsx');
      const switchSource = readSource('components/ui/switch.tsx');
      const command = readSource('components/ui/command.tsx');
      const sheet = readSource('components/ui/sheet.tsx');
      const sonner = readSource('components/ui/sonner.tsx');
      const alertDialog = readSource('components/ui/alert-dialog.tsx');

      expect(button).toContain('rounded-lg text-[13px]');
      expect(input).toContain('h-8');
      expect(input).toContain('rounded-lg');
      expect(dialog).toContain('bg-popover');
      expect(dialog).toContain('rounded-xl');
      expect(dialog).toContain('sm:max-w-[480px]');
      expect(dropdown).toContain('rounded-xl');
      expect(dropdown).toContain('h-8');
      expect(popover).toContain('rounded-xl');
      expect(select).toContain('rounded-xl');
      expect(select).toContain('h-8');
      expect(switchSource).toContain('before:w-[30px]');
      expect(switchSource).toContain('data-[state=checked]:translate-x-2.5');
      expect(command).toContain('rounded-xl');
      expect(sheet).toContain('bg-popover');
      expect(sonner).toContain('bg-popover');
      expect(alertDialog).toContain('bg-popover');
      expect(alertDialog).toContain('rounded-xl');

      const customizeSidebar = readSource('components/layout/sidebar/customize-sidebar-dialog.tsx');
      expect(customizeSidebar).toContain('top-[41.5%]');
      expect(customizeSidebar).toContain('lg:left-[calc(50%+113px)]');

      const createIssue = readSource('components/layout/sidebar/create-new-issue/index.tsx');
      expect(createIssue).toContain('top-[23.8%]');
      expect(createIssue).toContain('rounded-[21px]');
      expect(createIssue).toContain('gap-[5.5px]');
   });
});
