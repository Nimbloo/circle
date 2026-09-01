import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
   ISSUE_GROUP_HEADER_HEIGHT,
   ISSUE_ROW_HEIGHT,
} from '../components/common/issues/virtual-issue-list';

const readSource = (relativePath: string) =>
   readFileSync(join(process.cwd(), relativePath), 'utf8');

describe('issue list layout contract', () => {
   it('mantém estimadores e alturas visuais iguais ao Linear', () => {
      const virtualList = readSource('components/common/issues/virtual-issue-list.tsx');
      const issueLine = readSource('components/common/issues/issue-line.tsx');

      expect(ISSUE_GROUP_HEADER_HEIGHT).toBe(36);
      expect(ISSUE_ROW_HEIGHT).toBe(44);
      expect(virtualList).toContain('h-9');
      expect(virtualList).toContain('scrollbar-gutter:stable');
      expect(issueLine).toContain('h-11');
   });

   it('usa tokens do design system no board', () => {
      const groupIssues = readSource('components/common/issues/group-issues.tsx');
      const issueGrid = readSource('components/common/issues/issue-grid.tsx');

      expect(groupIssues).not.toMatch(/bg-zinc-/);
      expect(issueGrid).toContain('bg-card');
      expect(issueGrid).toContain('rounded-lg');
      expect(issueGrid).toContain('shadow-[var(--card-shadow)]');
      expect(issueGrid).not.toContain('border border-border/50 bg-card');
   });

   it('mantém o ritmo vertical compacto dos cards', () => {
      const assignee = readSource('components/common/issues/assignee-user.tsx');
      const priority = readSource('components/common/issues/priority-selector.tsx');
      const status = readSource('components/common/issues/status-selector.tsx');

      expect(assignee).toContain("compact ? 'size-[18px]' : 'size-6'");
      expect(priority).toContain("compact ? 'h-6 leading-none' : '*:not-first:mt-2'");
      expect(status).toContain("compact ? 'h-3.5 leading-none' : '*:not-first:mt-2'");
   });

   it('dimensiona o menu Display como o benchmark', () => {
      const displayOptions = readSource('components/layout/headers/display-options.tsx');

      expect(displayOptions).toContain('w-[302px]');
      expect(displayOptions).toContain('min-h-[541px]');
      expect(displayOptions).toContain("viewType === 'grid' ? 'Board options' : 'List options'");
      expect(displayOptions).toContain(
         "viewType === 'grid' ? 'Show empty columns' : 'Show empty groups'"
      );
   });

   it('usa a mesma superfície do Linear no seletor de filtros', () => {
      const filterSelector = readSource(
         'components/data-table-filter/components/filter-selector.tsx'
      );
      const filterBar = readSource('components/common/issues/issue-filter-bar.tsx');

      expect(filterSelector).toContain('w-[238px]');
      expect(filterSelector).toContain('rounded-xl');
      expect(filterSelector).toContain("boxShadow: 'var(--popover-shadow)'");
      expect(filterBar).toContain('h-[46px]');
      expect(filterBar).toContain('ml-2 mr-2.5');
      expect(filterBar).toContain('rounded-lg border bg-[var(--filter-bar)] p-2.5');
   });

   it('faz o skeleton ocupar exatamente uma row', () => {
      const skeleton = readSource('components/common/list-skeleton.tsx');

      expect(skeleton).toContain('h-11');
   });
});
