'use client';

import { Button } from '@/components/ui/button';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/client';
import type { TriageSuggestionDto } from '@/lib/api/triage';
import { ISSUE_CHANGED_EVENT } from '@/lib/use-live-sync';
import { useIssuesStore } from '@/store/issues-store';
import { useLabels, usePriorities } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * Card "Suggested" da triagem (#94): mostra o que a IA propôs para a issue (time,
 * prioridade, labels, possíveis duplicatas e um resumo) com **Accept**, **Edit** e
 * **Dismiss**.
 *
 * Honestidade: quando o Bedrock está indisponível a sugestão vem do fallback local
 * (`source === 'heuristic'`), e o card diz isso em vez de fingir uma classificação —
 * exibindo só as duplicatas. Sem duplicatas, o card não aparece.
 *
 * Realtime: a geração é assíncrona; o `ISSUE_CHANGED_EVENT` (SSE) refaz o fetch, então
 * o card aparece sozinho quando a sugestão fica pronta — a fila não espera pelo modelo.
 */

const NONE = '__none__';

interface TriageSuggestionCardProps {
   issueId: string;
   /** Sugestão já carregada (a fila busca todas de uma vez) — evita um GET por card. */
   initial?: TriageSuggestionDto;
   /** Conteúdo no topo do card (a fila mostra qual issue é). */
   heading?: React.ReactNode;
   /** Chamado após o Accept/Dismiss (o pai pode recarregar a fila/detalhe). */
   onResolved?: () => void;
   className?: string;
}

export function TriageSuggestionCard({
   issueId,
   initial,
   heading,
   onResolved,
   className,
}: TriageSuggestionCardProps) {
   const { orgId } = useParams<{ orgId?: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const priorities = usePriorities();
   const labels = useLabels();

   const [suggestion, setSuggestion] = useState<TriageSuggestionDto | null>(null);
   const [hidden, setHidden] = useState(false);
   const [pending, setPending] = useState(false);
   const [editing, setEditing] = useState(false);
   const [teamDraft, setTeamDraft] = useState<string>(NONE);
   const [priorityDraft, setPriorityDraft] = useState<string>(NONE);
   const [labelDraft, setLabelDraft] = useState<string[]>([]);
   const [duplicateDraft, setDuplicateDraft] = useState<string[]>([]);

   const hydrate = useCallback((dto: TriageSuggestionDto) => {
      setSuggestion(dto);
      setTeamDraft(dto.teamId ?? NONE);
      setPriorityDraft(dto.priorityId ?? NONE);
      setLabelDraft(dto.labelIds);
      setDuplicateDraft(dto.duplicates.map((d) => d.issueId));
   }, []);

   const load = useCallback(() => {
      let active = true;
      api.triage
         .suggestion(issueId)
         .then((dto) => {
            if (active) hydrate(dto);
         })
         .catch(() => {
            // Sem sugestão (ou erro) o card simplesmente não aparece — a fila segue.
            if (active) setSuggestion(null);
         });
      return () => {
         active = false;
      };
   }, [issueId, hydrate]);

   useEffect(() => {
      setHidden(false);
      setEditing(false);
      // A fila já traz a sugestão pronta: só o painel da issue precisa do GET.
      if (initial && initial.issueId === issueId) {
         hydrate(initial);
         return;
      }
      return load();
   }, [issueId, initial, hydrate, load]);

   // A sugestão chega depois (geração assíncrona): o evento da issue traz o card.
   useEffect(() => {
      const onChanged = (e: Event) => {
         const id = (e as CustomEvent<{ id?: string }>).detail?.id;
         if (!id || id === issueId) load();
      };
      window.addEventListener(ISSUE_CHANGED_EVENT, onChanged);
      return () => window.removeEventListener(ISSUE_CHANGED_EVENT, onChanged);
   }, [issueId, load]);

   if (!suggestion || hidden || suggestion.appliedAt || suggestion.dismissedAt) return null;
   const isHeuristic = suggestion.source === 'heuristic';
   // Fallback sem duplicata não tem o que sugerir — não ocupa espaço na tela.
   if (isHeuristic && suggestion.duplicates.length === 0) return null;

   const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? id;
   const priorityName = (id: string) => priorities.find((p) => p.id === id)?.name ?? id;
   const labelName = (id: string) => labels.find((l) => l.id === id)?.name ?? id;

   const accept = async () => {
      setPending(true);
      setHidden(true); // otimista: o card sai na hora
      try {
         await api.triage.accept(
            issueId,
            editing
               ? {
                    teamId: teamDraft === NONE ? null : teamDraft,
                    priorityId: priorityDraft === NONE ? null : priorityDraft,
                    labelIds: labelDraft,
                    duplicateIds: duplicateDraft,
                 }
               : {}
         );
         toast.success('Suggestion applied');
         void useIssuesStore.getState().applyRemote(issueId);
         onResolved?.();
      } catch (e) {
         setHidden(false); // rollback
         toast.error(e instanceof Error ? e.message : 'Falha ao aplicar a sugestão');
      } finally {
         setPending(false);
      }
   };

   const dismiss = async () => {
      setPending(true);
      setHidden(true);
      try {
         await api.triage.dismiss(issueId);
         onResolved?.();
      } catch {
         setHidden(false);
         toast.error('Falha ao descartar a sugestão');
      } finally {
         setPending(false);
      }
   };

   const toggle = (list: string[], id: string) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

   return (
      <section
         aria-label="Suggested triage"
         className={`rounded-md border border-border bg-container px-3 py-2.5 text-sm ${className ?? ''}`}
      >
         <header className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" />
            <h3 className="text-xs font-medium">Suggested</h3>
            {heading && <div className="min-w-0 flex-1 truncate text-xs">{heading}</div>}
         </header>

         {isHeuristic ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
               AI triage unavailable — showing duplicates only
            </p>
         ) : (
            <>
               {suggestion.summary && (
                  <p className="mt-1.5 text-xs text-muted-foreground">{suggestion.summary}</p>
               )}
               <dl className="mt-2 flex flex-col gap-1.5">
                  <Field label="Team">
                     {editing ? (
                        <Select value={teamDraft} onValueChange={setTeamDraft}>
                           <SelectTrigger aria-label="Team" className="h-7 w-56 text-xs">
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              <SelectItem value={NONE}>Keep current</SelectItem>
                              {teams.map((t) => (
                                 <SelectItem key={t.id} value={t.id}>
                                    {t.name}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     ) : (
                        <span>{suggestion.teamId ? teamName(suggestion.teamId) : '—'}</span>
                     )}
                  </Field>
                  <Field label="Priority">
                     {editing ? (
                        <Select value={priorityDraft} onValueChange={setPriorityDraft}>
                           <SelectTrigger aria-label="Priority" className="h-7 w-56 text-xs">
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              <SelectItem value={NONE}>Keep current</SelectItem>
                              {priorities.map((p) => (
                                 <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     ) : (
                        <span>
                           {suggestion.priorityId ? priorityName(suggestion.priorityId) : '—'}
                        </span>
                     )}
                  </Field>
                  <Field label="Labels">
                     {editing ? (
                        <div className="flex flex-wrap gap-1">
                           {labels.map((l) => (
                              <button
                                 key={l.id}
                                 type="button"
                                 aria-pressed={labelDraft.includes(l.id)}
                                 onClick={() => setLabelDraft((d) => toggle(d, l.id))}
                                 className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                                    labelDraft.includes(l.id)
                                       ? 'border-primary bg-primary/10 text-foreground'
                                       : 'border-border text-muted-foreground hover:text-foreground'
                                 }`}
                              >
                                 {l.name}
                              </button>
                           ))}
                        </div>
                     ) : suggestion.labelIds.length ? (
                        <div className="flex flex-wrap gap-1">
                           {suggestion.labelIds.map((id) => (
                              <span
                                 key={id}
                                 className="rounded-full border border-border px-2 py-0.5 text-xs"
                              >
                                 {labelName(id)}
                              </span>
                           ))}
                        </div>
                     ) : (
                        <span>—</span>
                     )}
                  </Field>
               </dl>
            </>
         )}

         {suggestion.duplicates.length > 0 && (
            <div className="mt-2.5">
               <h4 className="text-xs font-medium text-muted-foreground">Possible duplicates</h4>
               <ul className="mt-1 flex flex-col gap-1">
                  {suggestion.duplicates.map((d) => (
                     <li key={d.issueId} className="flex items-start gap-2 text-xs">
                        {editing && (
                           <input
                              type="checkbox"
                              aria-label={`Link ${d.identifier}`}
                              checked={duplicateDraft.includes(d.issueId)}
                              onChange={() => setDuplicateDraft((v) => toggle(v, d.issueId))}
                              className="mt-0.5"
                           />
                        )}
                        <Link
                           href={`/${orgId ?? 'nimbloo'}/issue/${d.identifier}`}
                           className="shrink-0 font-medium text-muted-foreground hover:text-foreground"
                        >
                           {d.identifier}
                        </Link>
                        <span className="min-w-0 truncate">{d.title}</span>
                        {d.reason && (
                           <span className="min-w-0 truncate text-muted-foreground">
                              · {d.reason}
                           </span>
                        )}
                     </li>
                  ))}
               </ul>
            </div>
         )}

         <div className="mt-3 flex items-center gap-1.5">
            <Button
               size="sm"
               className="h-7 text-xs"
               disabled={pending}
               onClick={() => void accept()}
            >
               Accept
            </Button>
            {!isHeuristic && (
               <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={pending}
                  onClick={() => setEditing((v) => !v)}
               >
                  {editing ? 'Done editing' : 'Edit'}
               </Button>
            )}
            <Button
               size="sm"
               variant="ghost"
               className="h-7 text-xs text-muted-foreground"
               disabled={pending}
               onClick={() => void dismiss()}
            >
               Dismiss
            </Button>
         </div>
      </section>
   );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
   return (
      <div className="flex items-start gap-2 text-xs">
         <dt className="w-16 shrink-0 pt-0.5 text-muted-foreground">{label}</dt>
         <dd className="min-w-0 flex-1">{children}</dd>
      </div>
   );
}
