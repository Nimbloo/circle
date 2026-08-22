'use client';

import {
   SidebarGroup,
   SidebarMenu,
   SidebarMenuBadge,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import { fetchReviews } from '@/lib/adapters-reviews';
import { inboxItems } from '@/mock-data/side-bar-nav';
import { useNotificationsStore } from '@/store/notifications-store';
import { usePreferencesStore } from '@/store/preferences-store';
import {
   isSidebarItemVisible,
   resolveOrder,
   SidebarItemKey,
   useSidebarPrefsStore,
} from '@/store/sidebar-prefs-store';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const ITEM_KEYS: Record<string, SidebarItemKey> = {
   'Inbox': 'inbox',
   'Reviews': 'reviews',
   'My issues': 'my-issues',
   'Agent': 'agent',
};

export function NavInbox() {
   const { orgId } = useParams<{ orgId: string }>();
   const { visibility, badgeStyle, order } = useSidebarPrefsStore();
   const { getUnreadCount } = useNotificationsStore();
   const [mounted, setMounted] = useState(false);
   const [reviewCount, setReviewCount] = useState(0);
   useEffect(() => setMounted(true), []);

   useEffect(() => {
      let active = true;
      fetchReviews({ limit: 1 })
         .then((page) => {
            if (active) setReviewCount(page.total);
         })
         .catch((e) => {
            // Badge best-effort: não quebra a navegação, mas não engolir em silêncio.
            console.warn('[nav-inbox] falha ao buscar review count', e);
         });
      return () => {
         active = false;
      };
   }, []);

   const unread = mounted ? getUnreadCount() : 0;
   const codeReviewsEnabled = usePreferencesStore((s) => s.codeReviewsEnabled);

   const orderedItems = mounted
      ? resolveOrder(order.personal, inboxItems.map((item) => ITEM_KEYS[item.name]).filter(Boolean))
           .map((key) => inboxItems.find((item) => ITEM_KEYS[item.name] === key))
           .filter((item): item is (typeof inboxItems)[number] => Boolean(item))
      : inboxItems;

   const items = orderedItems.filter((item) => {
      if (!mounted) return true;
      const key = ITEM_KEYS[item.name];
      if (!key) return true;
      // "Enable code reviews" (settings → Code & reviews) controla a aba Reviews.
      if (key === 'reviews' && !codeReviewsEnabled) return false;
      const badge = key === 'inbox' ? unread : key === 'reviews' ? reviewCount : 0;
      return isSidebarItemVisible(visibility[key], badge);
   });

   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         <SidebarMenu>
            {items.map((item) => (
               <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton asChild>
                     <Link href={`/${orgId}${item.url}`}>
                        <item.icon />
                        <span>{item.name}</span>
                     </Link>
                  </SidebarMenuButton>
                  {mounted && item.name === 'Inbox' && unread > 0 && (
                     <SidebarMenuBadge className="text-muted-foreground">
                        {badgeStyle === 'count' ? (
                           unread > 99 ? (
                              '99+'
                           ) : (
                              unread
                           )
                        ) : (
                           <span className="size-1.5 rounded-full bg-muted-foreground inline-block" />
                        )}
                     </SidebarMenuBadge>
                  )}
               </SidebarMenuItem>
            ))}
         </SidebarMenu>
      </SidebarGroup>
   );
}
