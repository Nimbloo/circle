import { beforeEach, describe, expect, it } from 'vitest';
import { useInitiativeDetailsStore } from '@/store/initiative-details-store';

describe('initiative details store', () => {
   beforeEach(() => {
      useInitiativeDetailsStore.setState({ open: true });
   });

   it('abre por padrão e alterna o painel', () => {
      expect(useInitiativeDetailsStore.getState().open).toBe(true);

      useInitiativeDetailsStore.getState().toggle();
      expect(useInitiativeDetailsStore.getState().open).toBe(false);

      useInitiativeDetailsStore.getState().setOpen(true);
      expect(useInitiativeDetailsStore.getState().open).toBe(true);
   });

   it('usa uma chave persistida exclusiva para initiatives', () => {
      expect(useInitiativeDetailsStore.persist.getOptions().name).toBe('initiative-details');
   });
});
// @vitest-environment jsdom
