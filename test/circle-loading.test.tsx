// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CircleLoading } from '@/components/common/circle-loading';

describe('CircleLoading', () => {
   it('anuncia o estado de forma polida e esconde só o SVG', () => {
      const { container } = render(<CircleLoading label="Carregando…" />);
      const status = screen.getByRole('status');
      expect(status.getAttribute('aria-live')).toBe('polite');
      expect(status.getAttribute('aria-hidden')).toBeNull();
      expect(status.textContent).toContain('Carregando…');
      expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
   });

   it('sem label visível ainda tem nome acessível', () => {
      render(<CircleLoading />);
      expect(screen.getByRole('status').textContent).toContain('Carregando');
      expect(screen.getByText('Carregando').className).toContain('sr-only');
   });

   it.each([
      ['sm', '16'],
      ['md', '24'],
      ['lg', '32'],
   ] as const)('tamanho %s → logo de %spx', (size, px) => {
      const { container } = render(<CircleLoading size={size} />);
      expect(container.querySelector('svg')?.getAttribute('width')).toBe(px);
      expect(screen.getByRole('status').dataset.size).toBe(size);
   });

   it('gira um arco sobre o anel apagado, com o ponto central fixo', () => {
      const { container } = render(<CircleLoading />);
      const svg = container.querySelector('svg')!;
      expect(svg.querySelector('[data-part="track"]')).not.toBeNull();
      expect(svg.querySelector('[data-part="dot"]')).not.toBeNull();
      const arc = svg.querySelector('[data-part="arc"]')!;
      expect(arc).not.toBeNull();
      expect(arc.getAttribute('class')).toContain('circle-loading-arc');
      // O ponto central não gira: fica fora do grupo animado.
      expect(arc.contains(svg.querySelector('[data-part="dot"]'))).toBe(false);
   });

   it('inline: sem bloco em coluna, cabe dentro de botão', () => {
      render(<CircleLoading size="sm" inline label="Carregando…" />);
      const status = screen.getByRole('status');
      expect(status.tagName).toBe('SPAN');
      expect(status.className).toContain('inline-flex');
      expect(status.className).not.toContain('flex-col');
   });

   /**
    * Continuidade entre instâncias (vi#12): numa carga fria a área troca de loader duas ou
    * três vezes. O arco de cada instância é alinhado ao relógio do documento e o fade de
    * entrada é pulado quando o loader anterior acabou de sair — um loader só, para quem
    * olha. O efeito visual só se valida no navegador; aqui fica a política.
    */
   describe('continuidade entre instâncias', () => {
      const spin = () => ({
         animationName: 'circle-loading-spin',
         startTime: null as number | null,
         finish: vi.fn(),
      });
      const fade = () => ({
         animationName: 'circle-loading-in',
         startTime: null as number | null,
         finish: vi.fn(),
      });
      let animations: ReturnType<typeof spin>[] = [];

      const stub = () => {
         animations = [spin(), fade()];
         Object.defineProperty(Element.prototype, 'getAnimations', {
            configurable: true,
            value: () => animations,
         });
         return animations;
      };

      afterEach(() => {
         delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
         vi.restoreAllMocks();
      });

      it('alinha o giro ao relógio do documento e mantém o fade da primeira instância', () => {
         // Nenhum loader por perto (o último saiu há muito): a entrada faz o fade normal.
         vi.spyOn(performance, 'now').mockReturnValue(1e9);
         const [arc, entrada] = stub();
         const { unmount } = render(<CircleLoading />);
         expect(arc.startTime).toBe(0);
         expect(entrada.finish).not.toHaveBeenCalled();
         unmount();
      });

      it('o loader que substitui outro não refaz o fade de entrada', () => {
         stub();
         const first = render(<CircleLoading />);
         const [, entrada] = stub();
         render(<CircleLoading />);
         expect(entrada.finish).toHaveBeenCalled();
         first.unmount();
      });
   });
});
