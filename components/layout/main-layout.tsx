import React from 'react';

interface MainLayoutProps {
   children: React.ReactNode;
   header?: React.ReactNode;
}

export default function MainLayout({ children, header }: MainLayoutProps) {
   // Frame interno per-página (header + área de scroll). O shell persistente
   // (SidebarProvider, AppSidebar, DataHydrator, CommandPalette) vive em
   // `app/[orgId]/layout.tsx` — assim não remonta a cada navegação.
   return (
      <main className="flex h-full w-full flex-col overflow-hidden bg-container lg:rounded-xl lg:border lg:border-border/60">
         {header && <div className="shrink-0">{header}</div>}
         <div className="min-h-0 w-full flex-1 overflow-auto">{children}</div>
      </main>
   );
}
