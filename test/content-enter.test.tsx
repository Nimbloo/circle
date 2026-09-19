// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { SettingsRow } from '@/components/common/settings/shared';
import { useEnterFade } from '@/components/common/loading-area';

/**
 * Política de fade (vi#12 a vi#15): UM fade por troca loading → conteúdo, no CONTAINER.
 * Linha não anima (só quando chega em tempo real), troca de irmão não anima e o fade da
 * rota nunca soma com o do conteúdo.
 */
describe('entrada suave de conteúdo', () => {
   it('vazio e erro entram com content-enter; a linha de settings não', () => {
      render(
         <>
            <EmptyState title="Nada aqui" />
            <ErrorState title="Falhou" description="Tente de novo." />
            <SettingsRow title="Linha" />
         </>
      );
      expect(screen.getByText('Nada aqui').closest('[data-variant]')!.className).toContain(
         'content-enter'
      );
      expect(screen.getByRole('alert').className).toContain('content-enter');
      // A linha de lista/settings não anima: o fade é do container que a recebe.
      expect(screen.getByText('Linha').closest('.content-enter')).toBeNull();
   });

   it('o fade só anima opacity e respeita prefers-reduced-motion', () => {
      const css = readFileSync('app/globals.css', 'utf8');
      const keyframes = css.match(/@keyframes content-enter\s*\{[\s\S]*?\}\s*\}/)![0];
      expect(keyframes).toContain('opacity');
      expect(keyframes).not.toContain('transform');
      const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
      expect(reduced).toContain('.content-enter');
      expect(reduced).toContain('.circle-loading-arc');
   });

   it('sob o fade da rota o conteúdo não faz um segundo fade', () => {
      const css = readFileSync('app/globals.css', 'utf8');
      const rule = css.slice(css.indexOf('.route-enter .content-enter'));
      // Delay negativo (e não `animation: none`): quando o template tira a classe a
      // animação já está terminada e não recomeça.
      expect(rule.slice(0, rule.indexOf('}'))).toContain('animation-delay: -1s');
   });
});

describe('useEnterFade', () => {
   function Area({ scope = 'x', children }: { scope?: string; children?: React.ReactNode }) {
      const fade = useEnterFade(scope);
      return <div data-fade={fade ? 'sim' : 'nao'}>{children}</div>;
   }
   const fadeOf = (container: HTMLElement) =>
      (container.firstElementChild as HTMLElement).dataset.fade;

   it('a primeira chegada anima; o irmão que substitui o anterior, não', () => {
      const first = render(<Area />);
      expect(fadeOf(first.container)).toBe('sim');

      // Troca de aba/item: o novo container renderiza com o antigo ainda montado.
      const sibling = render(<Area />);
      expect(fadeOf(sibling.container)).toBe('nao');

      // Área vazia de novo (voltou para a lista, por exemplo) → a próxima chegada anima.
      first.unmount();
      sibling.unmount();
      const again = render(<Area />);
      expect(fadeOf(again.container)).toBe('sim');
   });

   it('escopos diferentes não interferem', () => {
      render(<Area scope="a" />);
      const outro = render(<Area scope="b" />);
      expect(fadeOf(outro.container)).toBe('sim');
   });
});
