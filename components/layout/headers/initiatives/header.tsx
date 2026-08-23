'use client';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useInlineInitiativeStore } from '@/store/inline-initiative-store';
import { Plus } from 'lucide-react';

export default function Header() {
   const start = useInlineInitiativeStore((s) => s.start);
   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2">
            <SidebarTrigger />
            <span className="text-sm font-medium">Initiatives</span>
         </div>
         <Button size="xs" variant="ghost" aria-label="New initiative" onClick={start}>
            <Plus className="size-4" />
         </Button>
      </div>
   );
}
