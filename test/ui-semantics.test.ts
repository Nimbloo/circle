import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Circle } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import MainLayout from '@/components/layout/main-layout';
import { HeaderGroup } from '@/components/layout/header-primitives';
import { InitiativeProjectRow } from '@/components/common/initiatives/initiative-project-row';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { Project } from '@/data/projects';

describe('semântica da interface', () => {
   it('expõe um único landmark principal no frame da página', () => {
      const html = renderToStaticMarkup(
         createElement(MainLayout, null, createElement('article', null, 'Conteúdo'))
      );

      expect(html.match(/<main\b/g)).toHaveLength(1);
      expect(html).not.toMatch(/<main\b[^>]*>[\s\S]*<main\b/);
   });

   it('inclui a navegação da sidebar em todos os grupos de header', () => {
      const html = renderToStaticMarkup(
         createElement(
            SidebarProvider,
            null,
            createElement(HeaderGroup, null, createElement('span', null, 'Issues'))
         )
      );

      expect(html).toContain('data-sidebar="trigger"');
      expect(html).toContain('Toggle Sidebar');
      expect(html).toContain('Issues');
   });

   it('mantém remover projeto fora do link da iniciativa', () => {
      const project = {
         id: 'project-1',
         name: 'Projeto Atlas',
         icon: Circle,
         percentComplete: 42,
         startDate: '2026-08-01',
         targetDate: '2026-10-01',
         lead: null,
         priority: { id: 'medium', name: 'Medium', icon: Circle },
         health: { id: 'on-track', name: 'On track', color: '#00aa66', description: '' },
         status: { id: 'started', name: 'Started', category: 'started', icon: Circle },
         teamId: 'ENG',
         labels: [],
      } as unknown as Project;

      const html = renderToStaticMarkup(
         createElement(InitiativeProjectRow, {
            project,
            orgId: 'nimbloo',
            onRemove: () => undefined,
         })
      );
      const anchorEnd = html.indexOf('</a>');
      const buttonStart = html.indexOf('<button');

      expect(anchorEnd).toBeGreaterThan(-1);
      expect(buttonStart).toBeGreaterThan(anchorEnd);
      expect(html.slice(0, anchorEnd)).not.toContain('<button');
      expect(html).toContain('aria-label="Remove Projeto Atlas from initiative"');
   });
});
