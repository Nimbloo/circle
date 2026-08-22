import React from 'react';
import { AppSidebar } from '@/components/layout/sidebar/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { CreateIssueModalProvider } from '@/components/common/issues/create-issue-modal-provider';
import { CommandPalette } from '@/components/layout/command-palette';
import { DataHydrator } from '@/components/layout/data-hydrator';

/**
 * Shell PERSISTENTE do workspace. O Next mantém este layout montado ao navegar entre
 * as rotas de `[orgId]/*` — então o sidebar (e o avatar) NÃO remontam a cada navegação
 * (fim do "piscar" do avatar) e o `DataHydrator` roda o hydrate UMA vez, não a cada
 * página (antes o `MainLayout` per-page remontava tudo e re-baixava o workspace inteiro).
 * O `MainLayout` per-página passou a ser só o frame interno (header + área de scroll).
 */
export default function OrgLayout({ children }: { children: React.ReactNode }) {
   return (
      <SidebarProvider>
         <DataHydrator />
         <CreateIssueModalProvider />
         <CommandPalette />
         <AppSidebar />
         <div className="h-svh overflow-hidden lg:p-2 w-full">{children}</div>
      </SidebarProvider>
   );
}
