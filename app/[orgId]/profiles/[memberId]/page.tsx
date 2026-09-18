'use client';

import { use } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ListSkeleton } from '@/components/common/list-skeleton';
import MemberProfile from '@/components/common/members/member-profile';
import Header from '@/components/layout/headers/profile/header';
import MainLayout from '@/components/layout/main-layout';
import { useWorkspaceStore } from '@/store/workspace-store';
import { UserX } from 'lucide-react';

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
            <EmptyState
               icon={UserX}
               title="Member not found"
               description="This member doesn't exist or was removed from the workspace."
            />
         ) : (
            <div data-testid="profile-loading">
               <ListSkeleton />
            </div>
         )}
      </MainLayout>
   );
}
