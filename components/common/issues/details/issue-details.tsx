'use client';

import type { Issue } from '@/data/issues';
import type { IssueDetail } from '@/data/issue-details';
import { adaptIssueDetail, textToBlocks } from '@/lib/adapters-issue-detail';
import { adaptIssues } from '@/lib/adapters';
import { api } from '@/lib/client';
import { ISSUE_CHANGED_EVENT } from '@/lib/use-live-sync';
import { useIssuesStore } from '@/store/issues-store';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AssigneeUser } from '../assignee-user';
import { ActivityFeed } from './activity-feed';
import { ContentBlocks } from './content-blocks';
import { IssuePropertiesPanel } from './issue-properties-panel';
import { IssueDetailSkeleton } from './issue-detail-skeleton';
import { RelationEditor } from './relation-editor';
import { SubIssueCreate } from './sub-issue-create';

interface IssueDetailViewProps {
   issue: Issue;
   /** Conteúdo extra no topo da coluna principal (ex.: contexto da notificação no inbox). */
   banner?: ReactNode;
}

/**
 * Corpo COMPLETO da issue (padrão Linear): título e descrição editáveis inline,
 * sub-issues, activity feed com composer e a sidebar de properties. Reutilizado
 * pela página da issue e pelo preview do inbox — no Linear, selecionar uma
 * notificação abre a issue inteira, não um resumo read-only.
 *
 * A sidebar responde à largura do CONTAINER (não do viewport): no preview do
 * inbox o pane redimensionável pode ser estreito com o viewport largo — em
 * ≥48rem de pane ela aparece compacta (w-64) e em ≥64rem, larga (w-80).
 */
export function IssueDetailView({ issue, banner }: IssueDetailViewProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const issues = useIssuesStore((s) => s.issues);
   const inStore = useIssuesStore((s) => s.issues.some((i) => i.id === issue.id));

   const [detail, setDetail] = useState<IssueDetail | null>(null);
   const [loading, setLoading] = useState(true);
   const [reloadKey, setReloadKey] = useState(0);

   // Edição inline de título e descrição (padrão Linear). `rawDescription` guarda o
   // texto cru (o `detail.description` é ContentBlock[] só-leitura, adaptado do texto).
   const [editingTitle, setEditingTitle] = useState(false);
   const [titleDraft, setTitleDraft] = useState('');
   const [editingDesc, setEditingDesc] = useState(false);
   const [descDraft, setDescDraft] = useState('');
   const [rawDescription, setRawDescription] = useState('');
   // Override local do título para issue FORA do store (deep-link frio): o objeto vem
   // do pai e não flui de volta — o override exibe o valor salvo até o store assumir.
   const [localTitle, setLocalTitle] = useState<string | null>(null);

   // Ao trocar DE issue, volta ao skeleton. Depende do id (não do objeto): o splice do
   // SSE (applyRemote) troca a referência da issue no store e antes disparava um
   // refetch + skeleton em tela cheia a cada update — o "refresh completo" da página.
   const detailIssueId = issue.id;
   useEffect(() => {
      setDetail(null);
      setLoading(true);
      setLocalTitle(null);
      setEditingTitle(false);
      setEditingDesc(false);
   }, [detailIssueId]);

   useEffect(() => {
      if (!detailIssueId) return;
      let active = true;
      // Refetch silencioso (stale-while-revalidate): o conteúdo atual permanece na tela
      // enquanto o novo detail chega — skeleton só na primeira carga (detail === null).
      Promise.all([api.issues.detail(detailIssueId), api.issues.activity(detailIssueId)])
         .then(([detailDto, activity]) => {
            if (active) {
               setDetail(adaptIssueDetail(detailDto, activity));
               setRawDescription(detailDto.description ?? '');
            }
         })
         .catch(() => {
            // mantém o conteúdo atual se já havia (erro só derruba a primeira carga)
         })
         .finally(() => {
            if (active) setLoading(false);
         });
      return () => {
         active = false;
      };
   }, [detailIssueId, reloadKey]);

   // Realtime: quando o SSE avisa que esta issue mudou (comment/reaction/relation de
   // OUTRO usuário), refaz o fetch do detail/feed. Sem isso, o painel aberto fica stale.
   useEffect(() => {
      const onChanged = (e: Event) => {
         const id = (e as CustomEvent<{ id?: string }>).detail?.id;
         if (!id || id === detailIssueId) setReloadKey((k) => k + 1);
      };
      window.addEventListener(ISSUE_CHANGED_EVENT, onChanged);
      return () => window.removeEventListener(ISSUE_CHANGED_EVENT, onChanged);
   }, [detailIssueId]);

   const displayTitle = inStore ? issue.title : (localTitle ?? issue.title);

   if (loading || !detail) {
      // Loading → skeleton; erro real (não-loading, sem detail) → mensagem.
      if (loading) return <IssueDetailSkeleton />;
      return (
         <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Could not load issue details.
         </div>
      );
   }

   const subIssues = (detail.subIssueIds ?? [])
      .map((id) => issues.find((candidate) => candidate.id === id))
      .filter((candidate) => candidate !== undefined);

   // Persiste o título: pelo store (optimistic+rollback) quando a issue está no board,
   // ou direto na API + override local quando é deep-link frio (fora do store).
   const applyTitle = async () => {
      const next = titleDraft.trim();
      setEditingTitle(false);
      if (!next || next === displayTitle) return;
      if (inStore) {
         useIssuesStore.getState().updateIssue(issue.id, { title: next });
      } else {
         setLocalTitle(next);
         try {
            await api.issues.update(issue.id, { title: next });
         } catch {
            setLocalTitle(null);
            toast.error('Falha ao salvar o título');
         }
      }
   };

   const applyDescription = async () => {
      const next = descDraft;
      setEditingDesc(false);
      if (next.trim() === rawDescription.trim()) return;
      const prev = rawDescription;
      const prevBlocks = detail.description;
      // Otimista nos DOIS estados (texto cru + blocks renderizados) — a tela troca na
      // hora, sem refetch; o reload silencioso abaixo só reconcilia o activity feed.
      setRawDescription(next);
      setDetail((d) => (d ? { ...d, description: textToBlocks(next) } : d));
      try {
         await api.issues.updateDetail(issue.id, { description: next.trim() || null });
         setReloadKey((k) => k + 1);
      } catch {
         setRawDescription(prev);
         setDetail((d) => (d ? { ...d, description: prevBlocks } : d));
         toast.error('Falha ao salvar a descrição');
      }
   };

   return (
      <div className="@container w-full h-full flex overflow-hidden">
         {/* Main column */}
         <div className="flex-1 min-w-0 h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-10">
               {banner}
               {editingTitle ? (
                  <textarea
                     autoFocus
                     value={titleDraft}
                     onChange={(e) => setTitleDraft(e.target.value)}
                     onBlur={() => void applyTitle()}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                           e.preventDefault();
                           void applyTitle();
                        } else if (e.key === 'Escape') {
                           setEditingTitle(false);
                        }
                     }}
                     rows={1}
                     className="w-full resize-none bg-transparent text-3xl font-semibold leading-tight outline-none"
                  />
               ) : (
                  <h1
                     className="text-3xl font-semibold leading-tight text-balance cursor-text hover:bg-accent/20 rounded-md -mx-1 px-1 transition-colors"
                     onClick={() => {
                        setTitleDraft(displayTitle);
                        setEditingTitle(true);
                     }}
                  >
                     {displayTitle}
                  </h1>
               )}

               <div className="mt-6">
                  {editingDesc ? (
                     <textarea
                        autoFocus
                        value={descDraft}
                        onChange={(e) => setDescDraft(e.target.value)}
                        onBlur={() => void applyDescription()}
                        onKeyDown={(e) => {
                           if (e.key === 'Escape') setEditingDesc(false);
                        }}
                        placeholder="Add a description…"
                        rows={Math.max(4, descDraft.split('\n').length + 1)}
                        className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70"
                     />
                  ) : (
                     <div
                        className="cursor-text hover:bg-accent/10 rounded-md -mx-2 px-2 py-1 transition-colors min-h-[2rem]"
                        onClick={() => {
                           setDescDraft(rawDescription);
                           setEditingDesc(true);
                        }}
                     >
                        {rawDescription.trim() ? (
                           <ContentBlocks blocks={detail.description} />
                        ) : (
                           <span className="text-sm text-muted-foreground/70">
                              Add a description…
                           </span>
                        )}
                     </div>
                  )}
               </div>

               {/* Sub-issues */}
               <div className="mt-8">
                  {subIssues.length > 0 && (
                     <>
                        <h2 className="text-sm font-medium mb-1">
                           Sub-issues{' '}
                           <span className="text-muted-foreground">
                              {
                                 subIssues.filter(
                                    (subIssue) => subIssue.status.category === 'completed'
                                 ).length
                              }
                              /{subIssues.length}
                           </span>
                        </h2>
                        <div className="flex flex-col border-t border-border/50 mb-2">
                           {subIssues.map((subIssue) => (
                              <Link
                                 key={subIssue.id}
                                 href={`/${orgId ?? 'nimbloo'}/issue/${subIssue.identifier}`}
                                 className="flex items-center gap-2.5 h-10 px-1 border-b border-border/50 hover:bg-sidebar/50 text-sm min-w-0"
                              >
                                 <subIssue.status.icon />
                                 <span className="text-muted-foreground shrink-0 text-xs font-medium">
                                    {subIssue.identifier}
                                 </span>
                                 <span className="truncate font-medium">{subIssue.title}</span>
                                 <span className="ml-auto shrink-0">
                                    <AssigneeUser user={subIssue.assignee} issueId={subIssue.id} />
                                 </span>
                              </Link>
                           ))}
                        </div>
                     </>
                  )}
                  {/* Add-only: a lista rica acima já exibe os subs; o picker cria a relação
                      `sub` (filtrando os já vinculados via relatedIds) e refetch no onChanged. */}
                  <div className="flex flex-col gap-0.5">
                     <SubIssueCreate
                        parentId={issue.id}
                        teamId={issue.teamId}
                        projectId={issue.project?.id ?? null}
                        onCreated={() => setReloadKey((k) => k + 1)}
                     />
                     <RelationEditor
                        issueId={issue.id}
                        kind="sub"
                        relatedIds={detail.subIssueIds ?? []}
                        addLabel="Link existing issue"
                        renderList={false}
                        onChanged={() => setReloadKey((k) => k + 1)}
                     />
                  </div>
               </div>

               <div className="border-t border-border/60 mt-8" />

               <ActivityFeed
                  activity={detail.activity}
                  issueId={issue.id}
                  onCommentAdded={() => setReloadKey((k) => k + 1)}
               />
            </div>
         </div>

         {/* Properties sidebar — por container query: compacta em pane ≥48rem,
             larga em ≥64rem, oculta abaixo (pane estreito/mobile). */}
         <aside className="hidden @3xl:block w-64 @5xl:w-80 shrink-0 border-l h-full overflow-y-auto bg-container px-4 py-5 @5xl:px-5 @5xl:py-6">
            <IssuePropertiesPanel
               issue={issue}
               detail={detail}
               onChanged={() => setReloadKey((k) => k + 1)}
            />
         </aside>
      </div>
   );
}

/**
 * Issue detail page (rota /issue/[issueId]): resolve a issue pelo identifier
 * (store ou API no deep-link frio) e renderiza o corpo completo.
 */
export default function IssueDetails() {
   const { orgId, issueId } = useParams<{ orgId: string; issueId: string }>();
   const issues = useIssuesStore((s) => s.issues);

   // Issue do store (se já hidratado) — reusa sem request.
   const storeIssue = useMemo(
      () => issues.find((candidate) => candidate.identifier === issueId),
      [issues, issueId]
   );
   // Fallback: se o deep-link foi aberto direto (store ainda vazio), busca a issue por
   // identifier na API — sem esperar o board inteiro hidratar (fim do waterfall de ~500).
   // undefined = ainda buscando; null = buscou e não existe; Issue = encontrada.
   const [fetchedIssue, setFetchedIssue] = useState<Issue | null | undefined>(undefined);
   const issue = storeIssue ?? fetchedIssue ?? undefined;
   const resolvingIssue = !storeIssue && fetchedIssue === undefined;

   useEffect(() => {
      if (storeIssue) return; // já temos a issue no store
      let active = true;
      // Reset ao trocar de issueId (navegação entre deep-links) → volta a "Carregando…"
      // em vez de mostrar a issue anterior sob a nova URL enquanto o GET não resolve.
      setFetchedIssue(undefined);
      api.issues
         .get(issueId)
         .then((dto) => {
            if (active) setFetchedIssue(adaptIssues([dto])[0]);
         })
         .catch(() => {
            if (active) setFetchedIssue(null);
         });
      return () => {
         active = false;
      };
   }, [issueId, storeIssue]);

   if (!issue) {
      // Ainda resolvendo o deep-link → skeleton (não "not found" prematuro).
      if (resolvingIssue) return <IssueDetailSkeleton />;
      return (
         <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
            <p>Issue {issueId} not found.</p>
            <Link href={`/${orgId ?? 'nimbloo'}`} className="underline">
               Back to issues
            </Link>
         </div>
      );
   }

   return <IssueDetailView issue={issue} />;
}
