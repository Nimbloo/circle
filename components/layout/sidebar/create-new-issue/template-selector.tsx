'use client';

import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/client';
import type { TemplateDto } from '@/lib/api/templates';
import { FileText } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Seletor de template no New Issue: carrega os templates do time e, ao escolher,
 * pré-preenche o formulário. Não renderiza nada se o time não tiver templates
 * (evita afordância vazia).
 */
export function TemplateSelector({
   teamId,
   onApply,
}: {
   teamId: string;
   onApply: (t: TemplateDto) => void;
}) {
   const [templates, setTemplates] = useState<TemplateDto[]>([]);

   useEffect(() => {
      let active = true;
      if (!teamId) {
         setTemplates([]);
         return;
      }
      api.teams
         .templates(teamId)
         .then((t) => {
            if (active) setTemplates(t);
         })
         .catch(() => {
            if (active) setTemplates([]);
         });
      return () => {
         active = false;
      };
   }, [teamId]);

   if (templates.length === 0) return null;

   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
               <FileText className="size-4" />
               Template
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start">
            {templates.map((t) => (
               <DropdownMenuItem key={t.id} onSelect={() => onApply(t)}>
                  {t.name}
               </DropdownMenuItem>
            ))}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
