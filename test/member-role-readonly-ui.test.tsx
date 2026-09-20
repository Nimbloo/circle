// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { RoleControl } from '@/components/common/members/role-control';
import { useWorkspaceStore } from '@/store/workspace-store';

/** #52: papel somente leitura na UI, com a dica de onde alterar (Keycloak/Orbis). */
describe('RoleControl (#52)', () => {
   beforeEach(() => {
      useWorkspaceStore.setState({ me: { id: 'ana', admin: true } as never });
   });

   it('admin vê o papel como texto, sem seletor, com a dica de onde alterar', () => {
      render(<RoleControl role="Member" />);
      expect(screen.getByText('Member')).toBeTruthy();
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(screen.getByTitle(/Keycloak/)).toBeTruthy();
   });
});
