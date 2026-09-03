// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/**
 * A animação de abrir/fechar dos times na sidebar não vive em utilities do
 * componente, e sim numa regra global de `globals.css` sobre
 * `[data-slot='collapsible-content'][data-state]` (o Turbopack em dev não gerava as
 * utilities `animate-*` novas). Então o que precisa valer é: (1) o `CollapsibleContent`
 * renderiza o `data-slot`/`data-state` que a regra usa; (2) `nav-teams` usa ESSE
 * componente; (3) `globals.css` tem os keyframes e as regras.
 */

describe('motion da sidebar (times)', () => {
   it('CollapsibleContent renderiza data-slot e data-state que a regra global usa', () => {
      render(
         <Collapsible defaultOpen>
            <CollapsibleTrigger>Engineering</CollapsibleTrigger>
            <CollapsibleContent>
               <span>Issues</span>
            </CollapsibleContent>
         </Collapsible>
      );

      const content = screen.getByText('Issues').parentElement as HTMLElement;
      expect(content.getAttribute('data-slot')).toBe('collapsible-content');
      expect(content.getAttribute('data-state')).toBe('open');
      expect(screen.getByRole('button', { name: 'Engineering' }).getAttribute('data-slot')).toBe(
         'collapsible-trigger'
      );
   });

   it('nav-teams usa o CollapsibleContent do ui (não o primitivo Radix cru)', () => {
      const navTeams = readFileSync(
         join(process.cwd(), 'components/layout/sidebar/nav-teams.tsx'),
         'utf8'
      );

      expect(navTeams).toContain(
         "import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';"
      );
      expect(navTeams).toContain('<CollapsibleContent>');
      expect(navTeams).not.toContain('@radix-ui/react-collapsible');
   });

   it('globals.css tem os keyframes e as regras de [data-slot=collapsible-content]', () => {
      const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

      expect(css).toContain('@keyframes collapsible-down');
      expect(css).toContain('@keyframes collapsible-up');
      expect(css).toContain('height: var(--radix-collapsible-content-height)');
      expect(css).toMatch(
         /\[data-slot='collapsible-content'\]\[data-state='open'\]\s*\{\s*animation:\s*collapsible-down/
      );
      expect(css).toMatch(
         /\[data-slot='collapsible-content'\]\[data-state='closed'\]\s*\{\s*animation:\s*collapsible-up/
      );
      // Respeita prefers-reduced-motion.
      expect(css).toMatch(
         /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\[data-slot='collapsible-content'\]\s*\{\s*animation:\s*none/
      );
   });
});
