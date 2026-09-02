import { beforeEach, describe, expect, it } from 'vitest';
import {
   DEFAULT_INBOX_LIST_WIDTH,
   clampInboxListWidth,
   useInboxLayoutStore,
} from '@/store/inbox-layout-store';

describe('inbox layout store', () => {
   beforeEach(() => {
      useInboxLayoutStore.setState({ listWidth: DEFAULT_INBOX_LIST_WIDTH });
   });

   it('inicia a lista com 300px', () => {
      expect(useInboxLayoutStore.getState().listWidth).toBe(300);
   });

   it('limita a lista entre 300px e metade da área disponível', () => {
      expect(clampInboxListWidth(120, 1200)).toBe(300);
      expect(clampInboxListWidth(900, 1200)).toBe(600);
      expect(clampInboxListWidth(420, 1200)).toBe(420);
   });

   it('preserva o mínimo quando a área desktop tem menos de 600px', () => {
      expect(clampInboxListWidth(200, 560)).toBe(300);
   });
});
