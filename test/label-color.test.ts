import { describe, expect, it } from 'vitest';
import { labelColor } from '@/components/common/palette';

describe('labelColor — cor única de label (R8/If#13)', () => {
   it('cor nomeada vira token do tema; hex/CSS passa direto; vazio cai no muted', () => {
      expect(labelColor('red')).toBe('var(--destructive)');
      expect(labelColor('purple')).toBe('var(--primary)');
      expect(labelColor('#ff0000')).toBe('#ff0000');
      expect(labelColor(undefined)).toBe('var(--muted-foreground)');
      expect(labelColor('')).toBe('var(--muted-foreground)');
   });
});
