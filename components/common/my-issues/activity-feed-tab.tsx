'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { api } from '@/lib/client';
import type { MyActivityItemDto } from '@/lib/api/issue-detail';
import { ISSUE_CHANGED_EVENT } from '@/lib/use-live-sync';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Aba "Activity" do My issues: feed REAL de eventos + comentários das issues que
 * o usuário assina (GET /me/activity → activity_event + comment). Substitui a
 * antiga lista de issues heurística.
 */
export function ActivityFeedTab() {
   const { orgId } = useParams<{ orgId: string }>();
   const [items, setItems] = useState<MyActivityItemDto[] | null>(null);
   const [error, setError] = useState(false);

   useEffect(() => {
      let active = true;
      const load = () => {
         api.me
            .activity()
            .then((data) => {
               if (active) {
                  setItems(data);
                  setError(false);
               }
            })
            .catch(() => {
               if (active) setError(true);
            });
      };
      load();
      // Atualiza quando qualquer issue muda (novo evento/comentário) via SSE local.
      window.addEventListener(ISSUE_CHANGED_EVENT, load);
      return () => {
         active = false;
         window.removeEventListener(ISSUE_CHANGED_EVENT, load);
      };
   }, []);

   if (error) {
      return (
         <div className="text-center py-12 text-sm text-muted-foreground">
            Não foi possível carregar a atividade.
         </div>
      );
   }
   if (items === null) {
      return <div className="text-center py-12 text-sm text-muted-foreground">Carregando…</div>;
   }
   if (items.length === 0) {
      return (
         <div className="text-center py-12 text-sm text-muted-foreground">
            Sem atividade nas issues que você segue.
         </div>
      );
   }

   return (
      <div className="w-full h-full overflow-y-auto">
         <div className="max-w-3xl mx-auto px-6 py-4 divide-y">
            {items.map((item) => (
               <Link
                  key={`${item.event}-${item.id}`}
                  href={`/${orgId}/issue/${item.issueIdentifier}`}
                  className="flex items-start gap-3 py-3 hover:bg-sidebar/50 -mx-2 px-2 rounded"
               >
                  <Avatar className="size-6 mt-0.5 shrink-0">
                     {item.actor?.avatarUrl && <AvatarImage src={item.actor.avatarUrl} />}
                     <AvatarFallback className="text-[10px]">
                        {(item.actor?.name ?? '?').charAt(0).toUpperCase()}
                     </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 text-sm">
                     <span className="text-foreground">
                        <span className="font-medium">{item.actor?.name ?? 'Alguém'}</span>{' '}
                        <span className="text-muted-foreground">{item.text ?? item.event}</span>
                     </span>
                     <div className="text-xs text-muted-foreground truncate mt-0.5">
                        <span className="font-medium mr-1.5">{item.issueIdentifier}</span>
                        {item.issueTitle}
                     </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                     {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </span>
               </Link>
            ))}
         </div>
      </div>
   );
}
