// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OrgError from '@/app/[orgId]/error';

describe('[orgId]/error', () => {
   it('renderiza dentro do mesmo frame do MainLayout e permite tentar de novo', () => {
      const reset = vi.fn();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { container } = render(<OrgError error={new Error('boom')} reset={reset} />);

      const main = container.querySelector('main');
      expect(main).toBeTruthy();
      expect(main?.className).toContain('bg-container');
      expect(main?.className).toContain('h-full');
      expect(main?.contains(screen.getByRole('alert'))).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(reset).toHaveBeenCalledOnce();
   });
});
