// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

describe('template do workspace (If#19)', () => {
   it('anima troca de seção, mas não troca entre abas irmãs', () => {
      expect(navigate('/org/team/ENG/all')).toBe(true);
      expect(navigate('/org/team/ENG/active')).toBe(false);
      expect(navigate('/org/team/ENG/backlog')).toBe(false);
      expect(navigate('/org/inbox')).toBe(true);
      expect(navigate('/org/projects/all')).toBe(true);
      expect(navigate('/org/projects/all')).toBe(false);
   });
});
