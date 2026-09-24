'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, Search } from 'lucide-react';
import Link from 'next/link';
import { useLandingHref } from '@/lib/landing';

export function BackToApp({ orgId }: { orgId: string }) {
   const href = useLandingHref(orgId);
   return (
      <div className="flex w-full flex-col gap-3">
         <Button className="h-7 w-fit px-1 text-[13px]" size="xs" variant="ghost" asChild>
            {/* Landing resolvida no cliente: `/[orgId]` + redirect do servidor deixava o usuário em settings. */}
            <Link href={href}>
               <ChevronLeft className="size-3.5" />
               Back to app
            </Link>
         </Button>
         <Button
            className="h-7 w-full justify-start gap-2 border border-border/60 bg-secondary px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
            size="xs"
            variant="ghost"
            onClick={() => window.dispatchEvent(new CustomEvent('circle:open-command'))}
         >
            <Search className="size-3.5" />
            Search…
         </Button>
      </div>
   );
}
