// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MOTION_MS } from '@/lib/motion';

let pathname = '/org/team/ENG/all';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { default: OrgTemplate } = await import('@/app/[orgId]/template');

/** O template remonta a cada navegação (key = pathname simula isso). */
function navigate(to: string) {
   pathname = to;
   const { container, unmount } = render(
      <OrgTemplate key={to}>
         <span>página</span>
      </OrgTemplate>
   );
   const animated = (container.firstElementChild as HTMLElement).classList.contains('route-enter');
   unmount();
   return animated;
}

describe('template do workspace (If#19, vi#14)', () => {
   it('anima troca de seção, mas não a primeira carga nem a troca entre irmãos', () => {
      // Carga fria: nada de onde cruzar (e o conteúdo já tem o fade dele).
      expect(navigate('/org/team/ENG/all')).toBe(false);
      expect(navigate('/org/team/ENG/active')).toBe(false);
      expect(navigate('/org/team/ENG/backlog')).toBe(false);
      expect(navigate('/org/inbox')).toBe(true);
      expect(navigate('/org/projects/all')).toBe(true);
      expect(navigate('/org/projects/all')).toBe(false);
      // Seções de topo irmãs também animam (antes só as de dois segmentos animavam).
      expect(navigate('/org/views')).toBe(true);
      expect(navigate('/org/my-issues/assigned')).toBe(true);
      expect(navigate('/org/my-issues/created')).toBe(false);
      // Trocar de issue com j/k é troca de item, não de seção.
      expect(navigate('/org/issue/ENG-1')).toBe(true);
      expect(navigate('/org/issue/ENG-2')).toBe(false);
      // Time diferente é seção diferente; abas do mesmo time, não.
      expect(navigate('/org/team/ENG/all')).toBe(true);
      expect(navigate('/org/team/DES/all')).toBe(true);
      expect(navigate('/org/team/DES/backlog')).toBe(false);
   });

   it('a classe sai quando o fade termina, para o conteúdo que chegar depois ter o seu', () => {
      vi.useFakeTimers();
      pathname = '/org/inbox';
      render(
         <OrgTemplate>
            <span>página</span>
         </OrgTemplate>
      );
      pathname = '/org/projects/all';
      const { container } = render(
         <OrgTemplate key="projects">
            <span>página</span>
         </OrgTemplate>
      );
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.classList.contains('route-enter')).toBe(true);
      act(() => vi.advanceTimersByTime(MOTION_MS.content + 100));
      expect(wrapper.classList.contains('route-enter')).toBe(false);
      vi.useRealTimers();
   });
});
