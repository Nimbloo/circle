import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
   readFileSync(join(process.cwd(), relativePath), 'utf8');

describe('detail layout contract', () => {
   it('mantém o detalhe de issue no grid editorial medido no Linear', () => {
      const detail = readSource('components/common/issues/details/issue-details.tsx');
      const skeleton = readSource('components/common/issues/details/issue-detail-skeleton.tsx');
      const properties = readSource('components/common/issues/details/issue-properties-panel.tsx');
      const content = readSource('components/common/issues/details/content-blocks.tsx');
      const header = readSource('components/layout/headers/issue/header-nav.tsx');

      expect(detail).toContain('@7xl:max-w-[1247px]');
      expect(detail).toContain('@7xl:grid-cols-[minmax(0,791px)_400px]');
      expect(detail).toContain('@7xl:gap-14');
      expect(detail).toContain('text-2xl font-semibold leading-8');
      expect(skeleton).toContain('@7xl:max-w-[1247px]');
      expect(skeleton).toContain('@7xl:grid-cols-[minmax(0,791px)_400px]');
      expect(properties).not.toContain("'Subscribe'");
      expect(properties).not.toContain("'Subscribed'");
      expect(content).toContain('text-[15px] leading-6');
      expect(content).toContain('border-primary bg-primary');
      expect(content).not.toContain('indigo-');
      expect(header).not.toContain('SidebarTrigger');
      expect(header).toContain("aria-label={subscribed ? 'Unsubscribe' : 'Subscribe'}");
   });

   it('compartilha a coluna editorial e os cards laterais entre projeto e iniciativa', () => {
      const project = readSource('components/common/projects/details/project-overview.tsx');
      const projectSide = readSource('components/common/projects/details/project-side-panel.tsx');
      const projectProperties = readSource(
         'components/common/projects/details/project-properties-panel.tsx'
      );
      const projectHeader = readSource('components/layout/headers/project/header.tsx');
      const initiative = readSource('components/common/initiatives/initiative-details.tsx');
      const initiativeHeader = readSource('components/layout/headers/initiative/header.tsx');

      expect(project).toContain('max-w-[869px]');
      expect(project).toContain('px-8 pt-16');
      expect(project).toContain('text-2xl font-semibold leading-8');
      expect(projectSide).toContain('w-[400px]');
      expect(projectSide).toContain('pl-1');
      expect(projectSide).not.toContain('border-l');
      expect(projectProperties).toContain('rounded-[10px] border bg-card p-3');
      expect(projectProperties).not.toContain('border-b');
      expect(projectHeader).not.toContain('SidebarTrigger');

      expect(initiative).toContain('max-w-[869px]');
      expect(initiative).toContain('px-8 pt-16');
      expect(initiative).toContain('w-[400px]');
      expect(initiative).toContain('rounded-[10px] border bg-card p-3');
      expect(initiative).toContain('Write first initiative update');
      expect(initiative).not.toContain('border-l h-full');
      expect(initiativeHeader).not.toContain('SidebarTrigger');
   });
});
