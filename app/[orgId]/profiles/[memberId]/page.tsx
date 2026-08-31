'use client';

import { use } from 'react';
import MemberProfile from '@/components/common/members/member-profile';
import Header from '@/components/layout/headers/profile/header';
import MainLayout from '@/components/layout/main-layout';
import { useWorkspaceStore } from '@/store/workspace-store';

interface MemberProfilePageProps {
   params: Promise<{ memberId: string }>;
}

export default function MemberProfilePage({ params }: MemberProfilePageProps) {
   const { memberId } = use(params);
   const member = useWorkspaceStore((s) => s.getUserById(memberId));
   const loaded = useWorkspaceStore((s) => s.loaded);

   return (
      <MainLayout header={member ? <Header member={member} /> : undefined}>
         {member ? (
            <MemberProfile member={member} />
         ) : loaded ? (
            // Workspace carregado e o id não existe → not-found honesto
            // (antes ficava em "Carregando…" para sempre com id inválido).
            <div className="p-8 text-sm text-muted-foreground">Member not found.</div>
         ) : (
            <div className="p-8 text-sm text-muted-foreground">Carregando…</div>
         )}
      </MainLayout>
   );
}
