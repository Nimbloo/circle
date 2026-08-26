'use client';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/client';
import { IssueOptionsDropdown } from '@/components/common/issues/issue-options-dropdown';
import type { Issue } from '@/data/issues';
import type { IssueDetail } from '@/data/issue-details';
import { Bell, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

function IconButton({
   label,
   onClick,
   children,
   active,
}: {
   label: string;
   onClick: () => void;
   children: React.ReactNode;
   active?: boolean;
}) {
   return (
      <Button
         variant="ghost"
         size="icon"
         className={`size-7 ${active ? 'text-foreground' : 'text-muted-foreground'}`}
         onClick={onClick}
         aria-label={label}
         title={label}
      >
         {children}
      </Button>
   );
}

/**
 * Controles do header do detalhe do inbox (estilo Linear). `variant`:
 * - 'title'     → estrela (favorite) + ⋯ (issue options), ao lado do título
 * - 'subscribe' → sino (subscribe), no canto direito
 * Estado do sino e da estrela vem do `detail` (subscribed/favorited), otimista.
 */
export function DetailHeaderActions({
   issue,
   detail,
   variant = 'title',
}: {
   issue: Issue;
   detail: IssueDetail;
   variant?: 'title' | 'subscribe';
}) {
   const [subscribed, setSubscribed] = useState(detail.subscribed ?? false);
   const [favorited, setFavorited] = useState(detail.favorited ?? false);
   useEffect(() => setSubscribed(detail.subscribed ?? false), [detail.subscribed]);
   useEffect(() => setFavorited(detail.favorited ?? false), [detail.favorited]);

   const toggleSubscribe = async () => {
      const next = !subscribed;
      setSubscribed(next);
      try {
         const res = next
            ? await api.issues.subscribe(issue.id)
            : await api.issues.unsubscribe(issue.id);
         setSubscribed(res.subscribed);
      } catch {
         setSubscribed(!next);
         toast.error('Falha ao atualizar a inscrição');
      }
   };

   const toggleFavorite = async () => {
      const next = !favorited;
      setFavorited(next);
      try {
         const res = await api.issues.toggleFavorite(issue.id);
         setFavorited(res.favorited);
         toast.success(res.favorited ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
      } catch {
         setFavorited(!next);
         toast.error('Falha ao favoritar');
      }
   };

   if (variant === 'subscribe') {
      return (
         <IconButton
            label={subscribed ? 'Unsubscribe' : 'Subscribe'}
            onClick={toggleSubscribe}
            active={subscribed}
         >
            <Bell className={`size-4 ${subscribed ? 'fill-current' : ''}`} />
         </IconButton>
      );
   }

   // variant 'title': estrela + ⋯, coladas ao título (estilo Linear).
   return (
      <div className="flex items-center gap-0.5">
         <IconButton
            label={favorited ? 'Remove from favorites' : 'Add to favorites'}
            onClick={toggleFavorite}
            active={favorited}
         >
            <Star className={`size-4 ${favorited ? 'fill-current text-amber-400' : ''}`} />
         </IconButton>
         <IssueOptionsDropdown issueId={issue.id} />
      </div>
   );
}
