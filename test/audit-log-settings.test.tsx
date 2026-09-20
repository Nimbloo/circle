// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '@/store/workspace-store';
import { SidebarProvider } from '@/components/ui/sidebar';

Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});

const { ApiError } = await vi.importActual<typeof import('@/lib/client')>('@/lib/client');
const apiMocks = vi.hoisted(() => ({ audit: vi.fn() }));
vi.mock('@/lib/client', async (orig) => ({
   ...(await orig<typeof import('@/lib/client')>()),
   api: apiMocks,
}));

const { default: AuditLogSettings, ACTION_LABELS } = await import(
   '@/components/common/settings/audit-log-settings'
);

beforeEach(() => {
   vi.clearAllMocks();
   useWorkspaceStore.setState({ me: { id: 'me', admin: true } as never });
});

function entry(action: string) {
   return {
      id: action,
      actor: { id: 'u', slug: 'ana', name: 'Ana', email: 'ana@x', avatarUrl: null },
      action,
      targetType: null,
      targetId: null,
      meta: null,
      createdAt: new Date().toISOString(),
   };
}

/** Ações passadas a `recordAudit` no código (literais e ternários). */
function recordedActions(): Set<string> {
   const found = new Set<string>();
   const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
         const path = join(dir, name);
         if (statSync(path).isDirectory()) walk(path);
         else if (/\.tsx?$/.test(name)) {
            const src = readFileSync(path, 'utf8');
            for (const call of src.matchAll(/recordAudit\([^]*?action:([^\n]*)/g)) {
               for (const m of call[1].matchAll(/'([a-z_]+\.[a-z_]+)'/g)) found.add(m[1]);
            }
         }
      }
   };
   walk(join(process.cwd(), 'lib'));
   walk(join(process.cwd(), 'app'));
   return found;
}

describe('audit log (Ad#22)', () => {
   it('toda ação gravada no código tem rótulo legível', () => {
      const actions = recordedActions();
      expect(actions.size).toBeGreaterThan(5);
      const missing = [...actions].filter((a) => !(a in ACTION_LABELS));
      expect(missing).toEqual([]);
   });

   it('mostra o rótulo das ações reais', async () => {
      apiMocks.audit.mockResolvedValueOnce([entry('invite.create'), entry('webhook.delete')]);
      render(
         <SidebarProvider>
            <AuditLogSettings />
         </SidebarProvider>
      );
      expect(await screen.findByText(ACTION_LABELS['invite.create'])).toBeTruthy();
      expect(screen.getByText(ACTION_LABELS['webhook.delete'])).toBeTruthy();
   });

   it('erro de carga vira erro com retry, não "nenhuma ação"', async () => {
      apiMocks.audit.mockRejectedValueOnce(new ApiError(500, 'boom'));
      apiMocks.audit.mockResolvedValueOnce([entry('team.create')]);
      render(
         <SidebarProvider>
            <AuditLogSettings />
         </SidebarProvider>
      );
      const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
      expect(screen.queryByText('Nenhuma ação registrada ainda')).toBeNull();
      await userEvent.setup().click(retry);
      expect(await screen.findByText(ACTION_LABELS['team.create'])).toBeTruthy();
      expect(apiMocks.audit).toHaveBeenCalledTimes(2);
   });

   it('403 continua mostrando o aviso de só admin', async () => {
      apiMocks.audit.mockRejectedValueOnce(new ApiError(403, 'Apenas admin'));
      render(
         <SidebarProvider>
            <AuditLogSettings />
         </SidebarProvider>
      );
      expect(await screen.findByText(/Só administradores/)).toBeTruthy();
   });
});
