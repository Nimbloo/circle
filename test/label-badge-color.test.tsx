// @vitest-environment jsdom

import './setup-dom';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LabelBadge } from '@/components/common/issues/label-badge';

describe('LabelBadge — cor de label pelo token (If#13)', () => {
   it('cor nomeada do seed vira token do tema, não a cor crua do CSS', () => {
      const { container } = render(
         <LabelBadge label={[{ id: 'bug', name: 'Bug', color: 'red' }]} />
      );
      const dot = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
      expect(dot.style.backgroundColor).toBe('var(--destructive)');
   });
});
