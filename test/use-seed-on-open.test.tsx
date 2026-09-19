// @vitest-environment jsdom

import './setup-dom';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSeedOnOpen } from '@/hooks/use-seed-on-open';

/**
 * #38 (admin): diálogos de edição (time, view) re-semeavam o formulário a cada evento que
 * trocava a referência do objeto — o texto digitado sumia. Semeia só ao ABRIR.
 */
describe('useSeedOnOpen', () => {
   it('semeia ao abrir e não de novo quando a fonte muda com o diálogo aberto', () => {
      const seed = vi.fn();
      const { rerender } = renderHook(({ open, src }) => useSeedOnOpen(open, () => seed(src)), {
         initialProps: { open: false, src: 'v1' },
      });
      expect(seed).not.toHaveBeenCalled();
      rerender({ open: true, src: 'v1' });
      expect(seed).toHaveBeenCalledTimes(1);
      expect(seed).toHaveBeenLastCalledWith('v1');
      rerender({ open: true, src: 'v2' }); // evento com o diálogo aberto
      expect(seed).toHaveBeenCalledTimes(1);
      rerender({ open: false, src: 'v2' });
      rerender({ open: true, src: 'v2' }); // reabrir pega o valor atual
      expect(seed).toHaveBeenCalledTimes(2);
      expect(seed).toHaveBeenLastCalledWith('v2');
   });

   it('montado já aberto semeia uma vez', () => {
      const seed = vi.fn();
      renderHook(() => useSeedOnOpen(true, seed));
      expect(seed).toHaveBeenCalledTimes(1);
   });
});
