import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), 'components');

function tsxFiles(directory: string): string[] {
   return readdirSync(directory).flatMap((entry) => {
      const path = join(directory, entry);
      return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith('.tsx') ? [path] : [];
   });
}

describe('botões de opções', () => {
   it('não deixa MoreHorizontal com aparência de ação sem nome acessível', () => {
      const violations: string[] = [];

      for (const file of tsxFiles(root)) {
         const source = readFileSync(file, 'utf8');
         for (const match of source.matchAll(/<MoreHorizontal\b/g)) {
            const start = Math.max(0, match.index! - 500);
            const end = Math.min(source.length, match.index! + 500);
            const context = source.slice(start, end);
            if (!/aria-label=|className="sr-only"/.test(context)) {
               violations.push(
                  `${relative(process.cwd(), file)}:${source.slice(0, match.index).split('\n').length}`
               );
            }
         }
      }

      expect(violations).toEqual([]);
   });

   it('dá nome acessível a todo Button de ícone', () => {
      const violations: string[] = [];

      for (const file of tsxFiles(root)) {
         const source = readFileSync(file, 'utf8');
         for (const match of source.matchAll(/<Button\b[\s\S]*?<\/Button>/g)) {
            const block = match[0];
            if (!block.includes('size="icon"')) continue;
            if (!/aria-label=|className="sr-only"/.test(block)) {
               violations.push(
                  `${relative(process.cwd(), file)}:${source.slice(0, match.index).split('\n').length}`
               );
            }
         }
      }

      expect(violations).toEqual([]);
   });

   it('mantém nomes acessíveis nos controles compactos sem texto visível', () => {
      const themeToggle = readFileSync(join(root, 'layout/theme-toggle.tsx'), 'utf8');
      const assignee = readFileSync(join(root, 'common/issues/assignee-user.tsx'), 'utf8');
      const snooze = readFileSync(join(root, 'common/inbox/issue-line.tsx'), 'utf8');

      expect(themeToggle).toContain('aria-label={`Theme: ${mode}`}');
      expect(assignee).toContain('aria-label={');
      expect(assignee).toContain('type="button"');
      expect(snooze).toContain('className="flex size-7');
   });

   it('não deixa opções visuais de reviews sem comportamento', () => {
      const reviews = readFileSync(join(root, 'common/reviews/reviews.tsx'), 'utf8');
      const reviewDiff = readFileSync(join(root, 'common/reviews/review-diff.tsx'), 'utf8');

      expect(reviews).toContain('aria-label="Filter reviews"');
      expect(reviews).toContain('aria-label="Review display options"');
      expect(reviews).toContain('DropdownMenuCheckboxItem');
      expect(reviewDiff).toContain('aria-label="Diff display options"');
      expect(reviewDiff).toContain('checked={showFileTree}');
   });

   it('mantém uma ação real no estado vazio de projetos da iniciativa', () => {
      const details = readFileSync(join(root, 'common/initiatives/initiative-details.tsx'), 'utf8');

      expect(details).toContain('No projects in this initiative');
      expect(details).toContain('Add project to initiative');
      expect(details).toContain('onClick={() => setPickerOpen(true)}');
   });

   it('não anuncia criação de label quando o seletor só permite selecionar', () => {
      const picker = readFileSync(
         join(root, 'common/initiatives/initiative-label-picker.tsx'),
         'utf8'
      );

      expect(picker).toContain('<CommandEmpty>No labels found.</CommandEmpty>');
      expect(picker).not.toContain('Start typing to create');
   });

   it('não exibe no mobile o controle do painel desktop', () => {
      const panel = readFileSync(join(root, 'common/detail-side-panel.tsx'), 'utf8');

      expect(panel).toContain('className="hidden size-7 xl:inline-flex"');
      for (const file of [
         'layout/headers/initiative/header.tsx',
         'layout/headers/project/header.tsx',
         'layout/headers/issue/header-nav.tsx',
         'layout/headers/profile/header.tsx',
      ]) {
         expect(readFileSync(join(root, file), 'utf8')).toMatch(
            /<DetailPanelToggle kind="\w+" \/>/
         );
      }
   });

   it('mantém o painel de detalhes funcional em todas as abas da initiative', () => {
      const details = readFileSync(join(root, 'common/initiatives/initiative-details.tsx'), 'utf8');

      expect(details).toMatch(/const content\s*=\s*tab === 'activity'/);
      // Um único painel, fora das abas — não pode voltar a viver dentro do Overview.
      expect(details.match(/<DetailSidePanel\b/g)).toHaveLength(1);
      expect(details).not.toContain('<aside');
   });

   it('mantém paginação acessível quando o filtro zera a página carregada de reviews', () => {
      const reviews = readFileSync(join(root, 'common/reviews/reviews.tsx'), 'utf8');

      expect(reviews).toContain('function ReviewPagination(');
      expect(reviews).toContain('total > 0 && (');
      expect(reviews).toContain('<ReviewPagination');
   });

   it('trata falhas de clipboard sem promessas rejeitadas silenciosamente', () => {
      const clipboardControls = [
         'layout/headers/issue/header-nav.tsx',
         'layout/headers/team/header-nav.tsx',
         'layout/sidebar/nav-teams.tsx',
      ];

      for (const file of clipboardControls) {
         const source = readFileSync(join(root, file), 'utf8');
         expect(source).toContain("toast.error('Não foi possível copiar')");
      }
   });

   it('usa navegação hierárquica por teclado em todos os filtros com subpáginas', () => {
      const hierarchicalFilters = [
         'layout/headers/projects/filter.tsx',
         'layout/headers/teams/filter.tsx',
         'layout/headers/members/filter.tsx',
      ];

      for (const file of hierarchicalFilters) {
         const source = readFileSync(join(root, file), 'utf8');
         expect(source).toContain('useCommandPages');
         expect(source).toContain('data-command-page=');
         expect(source).toContain('onKeyDown={navigation.onKeyDown}');
         expect(source.match(/ref=\{navigation\.searchInputRef\}/g)).toHaveLength(3);
         expect(source).not.toContain('setActive(');
      }
   });
});
