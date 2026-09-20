// @vitest-environment jsdom

import './setup-dom';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/use-live-sync', () => ({ useLiveSync: () => {} }));
vi.mock('@/lib/user-settings-sync', () => ({ startUserSettingsSync: async () => {} }));
vi.mock('@/components/layout/preferences-applier', () => ({ PreferencesApplier: () => null }));
vi.mock('@/lib/client', () => ({ api: {} }));

const { DataHydrator } = await import('@/components/layout/data-hydrator');
const { useIssuesStore } = await import('@/store/issues-store');
const { useWorkspaceStore } = await import('@/store/workspace-store');
const { useNotificationsStore } = await import('@/store/notifications-store');

describe('DataHydrator', () => {
   it('hidrata o inbox em paralelo às issues (não espera as ~3k issues)', () => {
      const issues = vi.fn(() => new Promise<void>(() => {})); // nunca termina
      const notifications = vi.fn(async () => {});
      useIssuesStore.setState({ hydrate: issues });
      useWorkspaceStore.setState({ hydrate: vi.fn(async () => {}) });
      useNotificationsStore.setState({ hydrate: notifications });
      render(<DataHydrator />);
      expect(issues).toHaveBeenCalledTimes(1);
      expect(notifications).toHaveBeenCalledTimes(1);
   });
});
