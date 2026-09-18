import { describe, expect, it } from 'vitest';
import { t } from '@/components/data-table-filter/lib/i18n';

describe('locale pt-BR do filtro de tabela', () => {
   it('traduz as ações e operadores essenciais', () => {
      expect(t('clear', 'pt-BR')).toBe('Limpar');
      expect(t('search', 'pt-BR')).toBe('Buscar...');
      expect(t('filters.date.isOnOrAfter', 'pt-BR')).toBe('é em ou após');
   });
});
