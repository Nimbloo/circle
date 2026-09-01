import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
   readFileSync(join(process.cwd(), relativePath), 'utf8');

describe('special surfaces layout contract', () => {
   it('mantém o Inbox na grade fixa e na densidade medidas no Linear', () => {
      const inbox = readSource('components/common/inbox/inbox.tsx');
      const line = readSource('components/common/inbox/issue-line.tsx');
      const preview = readSource('components/common/inbox/issue-preview.tsx');

      expect(inbox).toContain('grid-cols-[300px_minmax(0,1fr)]');
      expect(inbox).toContain('h-11');
      expect(inbox).toContain('h-[calc(100%-44px)]');
      expect(inbox).not.toContain('ResizablePanel');
      expect(line).toContain('h-[55px]');
      expect(line).toContain('w-full pl-2.5');
      expect(line).toContain('rounded-lg px-2');
      expect(preview).toContain('No notification selected');
      expect(preview).toContain('h-[100px] w-[97.5px]');
      expect(preview).not.toContain('unread notification');
   });

   it('mantém a timeline de ciclos nas colunas e alturas medidas no Linear', () => {
      const cycles = readSource('components/common/cycles/cycles.tsx');
      const line = readSource('components/common/cycles/cycle-line.tsx');
      const header = readSource('components/layout/headers/cycles/header-nav.tsx');
      const chart = readSource('components/common/cycles/cycle-burnup-chart.tsx');
      const details = readSource('components/common/cycles/cycle-details-panel.tsx');

      expect(cycles).toContain('b.startDate.localeCompare(a.startDate)');
      expect(cycles).toContain('w-[126px]');
      expect(cycles).toContain('h-[216px]');
      expect(line).toContain('h-[70px]');
      expect(line).toContain('grid-cols-[minmax(0,1fr)_75px_142px_60px_44px]');
      expect(line).toContain('grid-cols-[minmax(0,1fr)_80px_110px_84px_60px_44px]');
      expect(header).not.toContain('SidebarTrigger');
      expect(header).not.toContain('ChevronRight');
      expect(line).not.toContain('className="contents"');
      expect(line).toContain('aria-label={`Open ${cycle.name}`}');
      expect(chart).not.toMatch(/#[\da-f]{3,8}/i);
      expect(details).not.toMatch(/#[\da-f]{3,8}/i);
   });
});
