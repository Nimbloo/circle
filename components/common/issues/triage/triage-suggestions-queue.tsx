'use client';

import type { TriageSuggestionDto } from '@/lib/api/triage';
import { api } from '@/lib/client';
import { ISSUE_CHANGED_EVENT } from '@/lib/use-live-sync';
import { useIssuesStore } from '@/store/issues-store';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TriageSuggestionCard } from './triage-suggestion-card';

/**
 * Sugestões da fila de Triage do time (#94). A fila de issues renderiza na hora; este
 * bloco carrega as sugestões prontas em UMA chamada (as que faltam são geradas em
 * background pelo servidor) e se atualiza pelo evento realtime da issue — por isso o
 * card aparece sozinho quando a sugestão fica pronta.
 */
export function TriageSuggestionsQueue() {
   const { orgId, teamId } = useParams<{ orgId?: string; teamId?: string }>();
   const issues = useIssuesStore((s) => s.issues);
   const [suggestions, setSuggestions] = useState<TriageSuggestionDto[]>([]);
   const [open, setOpen] = useState(true);

   const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

   const load = useCallback(() => {
      if (!teamId) return;
      api.triage
         .queue(teamId)
         .then(setSuggestions)
         .catch(() => setSuggestions([]));
   }, [teamId]);

   /**
    * O GET da fila gera as sugestões que faltam, e cada geração publica `issue updated`
    * — que chega de volta aqui como pedido de recarga. Sem debounce, uma fila com N
    * issues novas vira uma rajada de recargas que se realimenta. 400 ms agrupa a rajada
    * sem que a chegada do card pareça lenta.
    */
   const reload = useCallback(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
         timer.current = null;
         load();
      }, 400);
   }, [load]);

   useEffect(() => {
      load();
   }, [load]);

   const queued = useRef<Set<string>>(new Set());
   queued.current = new Set(suggestions.map((s) => s.issueId));

   // Uma issue mudou (sugestão pronta, accept/dismiss de outra aba): recarrega a lista —
   // mas só se o evento pode mexer NESTA fila (#28). Issue conhecida de outro time, ou
   // do time mas fora da triagem e fora da fila, não recarrega. Issue desconhecida pode
   // ter acabado de entrar na fila.
   useEffect(() => {
      const onChanged = (e: Event) => {
         const id = (e as CustomEvent<{ id?: string }>).detail?.id;
         if (id && !queued.current.has(id)) {
            const known = useIssuesStore.getState().issues.find((i) => i.id === id);
            if (known && (known.teamId !== teamId || known.status?.category !== 'triage')) return;
         }
         reload();
      };
      window.addEventListener(ISSUE_CHANGED_EVENT, onChanged);
      return () => {
         window.removeEventListener(ISSUE_CHANGED_EVENT, onChanged);
         if (timer.current) clearTimeout(timer.current);
      };
   }, [reload, teamId]);

   // Só as pendentes e com algo a dizer (o heurístico sem duplicata não vira card).
   const pending = suggestions.filter(
      (s) => !s.appliedAt && !s.dismissedAt && (s.source === 'ai' || s.duplicates.length > 0)
   );
   if (pending.length === 0) return null;

   // is#1: a fila tem altura máxima e rolagem própria — com centenas de cards ela
   // empurrava a lista de issues para fora da tela (pai overflow-hidden). O cabeçalho
   // mostra a contagem e colapsa a fila inteira.
   return (
      <section aria-label="Suggestions" className="flex shrink-0 flex-col border-b">
         <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 items-center gap-1.5 px-6 text-left text-xs font-medium text-muted-foreground transition-colors duration-[var(--dur-instant,80ms)] hover:text-foreground"
         >
            <ChevronRight
               className={`size-3.5 transition-transform duration-[var(--dur-instant,80ms)] ${open ? 'rotate-90' : ''}`}
            />
            {pending.length} {pending.length === 1 ? 'suggestion' : 'suggestions'}
         </button>
         {open && (
            <div
               data-slot="triage-suggestions-list"
               className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto px-6 pb-3"
            >
               {pending.map((s) => {
                  const issue = issues.find((i) => i.id === s.issueId);
                  return (
                     <TriageSuggestionCard
                        key={s.issueId}
                        issueId={s.issueId}
                        initial={s}
                        onResolved={load}
                        className="shrink-0"
                        heading={
                           issue ? (
                              <Link
                                 href={`/${orgId ?? 'nimbloo'}/issue/${issue.identifier}`}
                                 className="text-muted-foreground hover:text-foreground"
                              >
                                 {issue.identifier} · {issue.title}
                              </Link>
                           ) : null
                        }
                     />
                  );
               })}
            </div>
         )}
      </section>
   );
}
