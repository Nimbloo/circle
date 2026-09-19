'use client';

import type { Issue } from '@/data/issues';
import { cn } from '@/lib/utils';
import type { IssueDetail } from '@/data/issue-details';
import { adaptActivity, adaptIssueDetail, textToBlocks } from '@/lib/adapters-issue-detail';
import { adaptIssues } from '@/lib/adapters';
import { api, ApiError } from '@/lib/client';
import { blocksToDoc, type EditorDoc } from '@/lib/editor-doc';
import { ISSUE_CHANGED_EVENT } from '@/lib/use-live-sync';
import { useIssuesStore } from '@/store/issues-store';
import { useCurrentIssueStore } from '@/store/current-issue-store';
import { useStatuses } from '@/store/catalog-store';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DetailSidePanel, DetailSidePanelTrigger } from '@/components/common/detail-side-panel';
import { BlockEditor } from '@/components/common/editor/block-editor';
import { ActivityFeed, type CommentPatch } from './activity-feed';
import { AttachmentsSection } from './attachments-section';
import { useAttachmentUploader } from './use-attachment-uploader';
import { filesOf, isImageFile } from '@/lib/attachments-client';
import { IssuePropertiesPanel } from './issue-properties-panel';
import { LoadingArea, useEnterFade } from '@/components/common/loading-area';
import { IssuePicker } from './issue-picker';
import { useParentCandidatesExclusion, useSetParent } from './parent-issue';
import { SubIssueCreate } from './sub-issue-create';
import { SubIssueProgress } from '../sub-issue-progress';
import { SubIssueRow } from './sub-issue-row';
import { TriageSuggestionCard } from '../triage/triage-suggestion-card';
import { adaptUser } from '@/lib/adapters';

interface IssueDetailViewProps {
   issue: Issue;
   /** Conteúdo extra no topo da coluna principal (ex.: contexto da notificação no inbox). */
   banner?: ReactNode;
   /** Notifica cada detail carregado (a página publica no current-issue-store p/ o header). */
   onDetailLoaded?: (detail: IssueDetail) => void;
}

/**
 * "Add existing issue" (#95): escolhe uma issue (store + busca no servidor) e a torna
 * filha desta — `parentId` na escolhida. Exclui a própria issue, as filhas atuais e as
 * descendentes conhecidas (o servidor ainda barra ciclo com 400).
 */
function AddExistingSubIssue({
   issue,
   childIds,
   onChanged,
}: {
   issue: Issue;
   childIds: string[];
   onChanged: () => void;
}) {
   const [open, setOpen] = useState(false);
   const setParent = useSetParent();
   const excludeIds = useParentCandidatesExclusion(issue.id, childIds);
   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <button
               type="button"
               className="flex items-center gap-1.5 h-8 px-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
               <Plus className="size-4" />
               Add existing issue
            </button>
         </PopoverTrigger>
         <PopoverContent className="border-input w-80 p-0" align="start">
            <IssuePicker
               excludeIds={excludeIds}
               onSelect={async (child) => {
                  setOpen(false);
                  if (await setParent(child.id, issue.id)) onChanged();
               }}
            />
         </PopoverContent>
      </Popover>
   );
}

/**
 * Corpo COMPLETO da issue (padrão Linear): título e descrição editáveis inline,
 * sub-issues, activity feed com composer e a sidebar de properties. Reutilizado
 * pela página da issue e pelo preview do inbox — no Linear, selecionar uma
 * notificação abre a issue inteira, não um resumo read-only.
 *
 * A sidebar é o `DetailSidePanel` compartilhado (400px no desktop, Sheet no mobile,
 * aberto/fechado pelo `detail-panel-store`), o mesmo de initiative e project; o
 * conteúdo ocupa a largura restante, centralizado nos 791px medidos no Linear.
 */
export function IssueDetailView(props: IssueDetailViewProps) {
   // Uma instância por issue (#26): trocar A→B remonta — sem frame com o detail de A sob
   // B nem refs de versão da descrição compartilhados (409 falso ao navegar).
   return <IssueDetailBody key={props.issue.id} {...props} />;
}

/** Janela em que uma mudança remota desta issue é tratada como eco da própria ação. */
const OWN_ECHO_MS = 2000;
/** Janela que junta uma rajada de comentários remotos numa única recarga do feed. */
const ACTIVITY_COALESCE_MS = 150;

function IssueDetailBody({ issue, banner, onDetailLoaded }: IssueDetailViewProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const inStore = useIssuesStore((s) => s.issues.some((i) => i.id === issue.id));
   // Troca de irmão (aba, item, layout) não pisca: só a primeira chegada de conteúdo.
   const fade = useEnterFade('issue-detail');
   const statuses = useStatuses();

   const [detail, setDetail] = useState<IssueDetail | null>(null);
   const [loading, setLoading] = useState(true);
   const [reloadKey, setReloadKey] = useState(0);

   // Edição inline do título (padrão Linear). A descrição é o editor de blocos, sempre
   // editável: `descriptionDoc` é o doc do servidor ou, quando ele ainda não existe, a
   // conversão da projeção em texto (`textToBlocks` → `blocksToDoc`).
   const [editingTitle, setEditingTitle] = useState(false);
   const [titleDraft, setTitleDraft] = useState('');
   const [descriptionDoc, setDescriptionDoc] = useState<EditorDoc | null>(null);
   // Override local do título para issue FORA do store (deep-link frio): o objeto vem
   // do pai e não flui de volta — o override exibe o valor salvo até o store assumir.
   const [localTitle, setLocalTitle] = useState<string | null>(null);
   // Concorrência otimista da descrição (#36): a versão que este editor viu, os saves em
   // fila (um de cada vez, sempre com a versão mais recente) e a época do editor — trocá-la
   // remonta o editor com a versão do servidor depois de um conflito.
   const descriptionVersion = useRef<string | null>(null);
   const saveQueue = useRef<Promise<void>>(Promise.resolve());
   const conflict = useRef(false);
   const [editorEpoch, setEditorEpoch] = useState(0);
   const descriptionBox = useRef<HTMLDivElement>(null);

   // O fetch depende do id (não do objeto): o splice do SSE (applyRemote) troca a
   // referência da issue no store e não deve refazer o GET. A troca DE issue remonta
   // (key no `IssueDetailView`), então o estado já nasce limpo.
   const detailIssueId = issue.id;

   useEffect(() => {
      if (!detailIssueId) return;
      let active = true;
      // Refetch silencioso (stale-while-revalidate): o conteúdo atual permanece na tela
      // enquanto o novo detail chega — loading só na primeira carga (detail === null).
      Promise.all([api.issues.detail(detailIssueId), api.issues.activity(detailIssueId)])
         .then(([detailDto, activity]) => {
            if (active) {
               const adapted = adaptIssueDetail(detailDto, activity);
               setDetail(adapted);
               onDetailLoaded?.(adapted);
               // O editor com foco NÃO adota o doc recarregado (preserva a digitação): aí a
               // versão também não avança, e o próximo save acusa o conflito (409).
               const typing = descriptionBox.current?.contains(document.activeElement) ?? false;
               if (!typing || descriptionVersion.current === null)
                  descriptionVersion.current = detailDto.descriptionVersion ?? null;
               setDescriptionDoc(
                  detailDto.descriptionDoc ?? blocksToDoc(textToBlocks(detailDto.description))
               );
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
      // eslint-disable-next-line react-hooks/exhaustive-deps -- onDetailLoaded é callback estável do pai
   }, [detailIssueId, reloadKey]);

   // Só o feed (#27): comentário novo/removido não precisa do detail inteiro.
   const activitySeq = useRef(0);
   const reloadActivity = useCallback(() => {
      const seq = ++activitySeq.current;
      api.issues
         .activity(detailIssueId)
         .then((list) => {
            if (seq !== activitySeq.current) return;
            const activity = adaptActivity(list);
            setDetail((d) => (d ? { ...d, activity } : d));
         })
         .catch(() => {
            // mantém o feed atual; o próximo evento/reload reconcilia
         });
   }, [detailIssueId]);
   const reloadActivityRef = useRef(reloadActivity);
   reloadActivityRef.current = reloadActivity;

   // Patch otimista de comentário (reação/edição/resolve) aplicado no feed local.
   const patchComment = useCallback((id: string, patch: CommentPatch) => {
      setDetail((d) =>
         d
            ? {
                 ...d,
                 activity: d.activity.map((it) =>
                    it.kind === 'comment' && it.id === id ? { ...it, ...patch } : it
                 ),
              }
            : d
      );
   }, []);

   // Eco da própria ação: o SSE avisa esta aba também. Com `own` no evento (clientId da
   // aba, If#16), o eco é reconhecido; sem ele, dentro da janela da ação, recarrega só o feed no fim dela
   // (um evento de outra pessoa no mesmo intervalo não se perde).
   const ownActionUntil = useRef(0);
   const echoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
   const activityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
   const markOwnAction = useCallback(() => {
      ownActionUntil.current = Date.now() + OWN_ECHO_MS;
   }, []);
   useEffect(
      () => () => {
         if (echoTimer.current) clearTimeout(echoTimer.current);
         if (activityTimer.current) clearTimeout(activityTimer.current);
      },
      []
   );

   // Realtime: quando o SSE avisa que esta issue mudou (comment/reaction/relation de
   // OUTRO usuário), refaz o fetch do detail/feed. Sem isso, o painel aberto fica stale.
   useEffect(() => {
      const onChanged = (e: Event) => {
         const d =
            (e as CustomEvent<{ id?: string; own?: boolean; scope?: 'activity' }>).detail ?? {};
         if (d.id && d.id !== detailIssueId) return;
         const remaining = ownActionUntil.current - Date.now();
         if (remaining > 0) {
            if (d.own) return;
            echoTimer.current ??= setTimeout(() => {
               echoTimer.current = null;
               reloadActivityRef.current();
            }, remaining);
            return;
         }
         // Comentário/reação de outra pessoa: só o feed mudou (#27).
         if (d.scope === 'activity') {
            activityTimer.current ??= setTimeout(() => {
               activityTimer.current = null;
               reloadActivityRef.current();
            }, ACTIVITY_COALESCE_MS);
            return;
         }
         setReloadKey((k) => k + 1);
      };
      window.addEventListener(ISSUE_CHANGED_EVENT, onChanged);
      return () => window.removeEventListener(ISSUE_CHANGED_EVENT, onChanged);
   }, [detailIssueId]);

   // Depois do remount pós-conflito, o editor novo volta a salvar (o flush do editor
   // antigo, no unmount, já foi descartado).
   useEffect(() => {
      conflict.current = false;
   }, [editorEpoch]);

   const displayTitle = inStore ? issue.title : (localTitle ?? issue.title);

   // Anexos da issue: upload compartilhado pela seção Attachments e pelo colar/soltar de
   // arquivo não-imagem na descrição (imagem continua indo pro editor).
   const reload = useCallback(() => setReloadKey((k) => k + 1), []);
   const { pending: pendingAttachments, addFiles: addAttachments } = useAttachmentUploader(
      issue.id,
      reload
   );
   const nonImageFiles = (list: FileList | null | undefined) =>
      filesOf(list).filter((f) => !isImageFile(f));

   if (loading || !detail) {
      // Loading → CircleLoading; erro real (não-loading, sem detail) → mensagem com retry.
      if (loading) return <LoadingArea className="h-full" />;
      return (
         <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>Could not load issue details.</span>
            <button
               type="button"
               onClick={() => {
                  setLoading(true);
                  setReloadKey((k) => k + 1);
               }}
               className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent/50"
            >
               Try again
            </button>
         </div>
      );
   }

   // Filhas vêm resolvidas do servidor (detail.subIssues) — sem cruzar com o store, então
   // uma filha fora do board (outro time, não hidratado) também aparece.
   const subIssues = detail.subIssues ?? [];
   const statusById = new Map(statuses.map((s) => [s.id, s]));
   const doneCount = subIssues.filter(
      (s) => statusById.get(s.statusId)?.category === 'completed'
   ).length;

   // Persiste o título: pelo store (optimistic+rollback) quando a issue está no board,
   // ou direto na API + override local quando é deep-link frio (fora do store).
   const applyTitle = async () => {
      const next = titleDraft.trim();
      setEditingTitle(false);
      if (!next || next === displayTitle) return;
      if (inStore) {
         // Store reverte + toast no erro; sem rejeição solta (Is#13).
         void useIssuesStore
            .getState()
            .updateIssue(issue.id, { title: next })
            .catch(() => undefined);
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

   // O editor já mostra o que o usuário digitou; só o erro precisa de feedback (sem
   // toast de sucesso — o save é contínuo, com debounce).
   const saveDescription = (doc: EditorDoc) => {
      if (conflict.current) return;
      saveQueue.current = saveQueue.current.then(async () => {
         if (conflict.current) return;
         try {
            const dto = await api.issues.updateDetail(issue.id, {
               descriptionDoc: doc,
               expectedDescriptionVersion: descriptionVersion.current,
            });
            descriptionVersion.current = dto.descriptionVersion ?? null;
         } catch (e) {
            if (!(e instanceof ApiError && e.status === 409)) {
               toast.error('Falha ao salvar a descrição');
               return;
            }
            // Outra pessoa gravou no meio: carrega a versão dela em vez de sobrescrever.
            conflict.current = true;
            toast.warning(
               'A descrição foi alterada por outra pessoa. Carregamos a versão mais recente.'
            );
            try {
               const fresh = await api.issues.detail(issue.id);
               descriptionVersion.current = fresh.descriptionVersion ?? null;
               setDescriptionDoc(
                  fresh.descriptionDoc ?? blocksToDoc(textToBlocks(fresh.description))
               );
            } finally {
               setEditorEpoch((n) => n + 1);
            }
         }
      });
   };

   return (
      <div className={cn(fade && 'content-enter', 'flex h-full w-full overflow-hidden')}>
         {/* Main column — conteúdo centralizado nos 791px medidos no Linear. */}
         <article className="h-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-8 sm:px-8 sm:py-10 xl:pt-[59px]">
            <div className="mx-auto w-full max-w-[791px]">
               <div className="mb-5 flex justify-end xl:hidden">
                  <DetailSidePanelTrigger kind="issue" />
               </div>
               {banner}
               {/* Triagem com IA (#94): o card só existe enquanto a issue está na fila. */}
               {issue.status.category === 'triage' && (
                  <TriageSuggestionCard
                     issueId={issue.id}
                     className="mb-5"
                     onResolved={() => setReloadKey((k) => k + 1)}
                  />
               )}
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
                     className="w-full resize-none bg-transparent text-2xl font-semibold leading-8 outline-none"
                  />
               ) : (
                  <h1
                     className="cursor-text rounded-md text-2xl font-semibold leading-8 text-balance transition-colors hover:bg-accent/20"
                     onClick={() => {
                        setTitleDraft(displayTitle);
                        setEditingTitle(true);
                     }}
                  >
                     {displayTitle}
                  </h1>
               )}

               {/* Colar/soltar arquivo que NÃO é imagem na descrição vira anexo da issue; o
                   editor só trata imagens (o evento sobe até aqui sem ser consumido). */}
               <div
                  ref={descriptionBox}
                  className="mt-6 min-h-8"
                  onPaste={(e) => {
                     const files = nonImageFiles(e.clipboardData?.files);
                     if (files.length) {
                        e.preventDefault();
                        void addAttachments(files);
                     }
                  }}
                  onDrop={(e) => {
                     const files = nonImageFiles(e.dataTransfer?.files);
                     if (files.length) {
                        e.preventDefault();
                        void addAttachments(files);
                     }
                  }}
               >
                  <BlockEditor
                     key={`${issue.id}:${editorEpoch}`}
                     doc={descriptionDoc}
                     placeholder="Add a description…"
                     onSave={saveDescription}
                     context={
                        issue.teamId
                           ? {
                                issueId: issue.id,
                                teamId: issue.teamId,
                                projectId: issue.project?.id ?? null,
                             }
                           : undefined
                     }
                  />
               </div>

               <AttachmentsSection
                  attachments={detail.attachments ?? []}
                  pending={pendingAttachments}
                  onAddFiles={(files) => void addAttachments(files)}
                  onChanged={reload}
               />

               {/* Sub-issues (#95) */}
               <section className="mt-8" aria-label="Sub-issues">
                  {subIssues.length > 0 && (
                     <>
                        <h2 className="mb-1 flex items-center gap-2 text-sm font-medium">
                           Sub-issues
                           <SubIssueProgress count={subIssues.length} done={doneCount} />
                        </h2>
                        <div className="flex flex-col border-t border-border/50 mb-2">
                           {subIssues.map((subIssue) => {
                              const status = statusById.get(subIssue.statusId);
                              if (!status) return null;
                              return (
                                 <SubIssueRow
                                    key={subIssue.id}
                                    id={subIssue.id}
                                    identifier={subIssue.identifier}
                                    title={subIssue.title}
                                    status={status}
                                    assignee={
                                       subIssue.assignee ? adaptUser(subIssue.assignee) : null
                                    }
                                    orgId={orgId ?? 'nimbloo'}
                                 />
                              );
                           })}
                        </div>
                     </>
                  )}
                  <div className="flex flex-col gap-0.5">
                     <SubIssueCreate
                        parentId={issue.id}
                        onCreated={() => setReloadKey((k) => k + 1)}
                     />
                     <AddExistingSubIssue
                        issue={issue}
                        childIds={subIssues.map((s) => s.id)}
                        onChanged={() => setReloadKey((k) => k + 1)}
                     />
                  </div>
               </section>

               <div className="border-t border-border/60 mt-8" />

               <ActivityFeed
                  activity={detail.activity}
                  issueId={issue.id}
                  issueContext={{
                     teamId: issue.teamId,
                     projectId: issue.project?.id ?? null,
                     assigneeId: issue.assignee?.id ?? null,
                  }}
                  onCommentAdded={reloadActivity}
                  onCommentPatch={patchComment}
                  onOwnAction={markOwnAction}
                  onIssueChanged={reload}
               />
            </div>
         </article>

         {/* Properties sidebar — 400px, mesmo painel de initiative e project. */}
         <DetailSidePanel
            kind="issue"
            title="Issue details"
            description="View and edit the properties of this issue."
         >
            <div className="h-full w-full overflow-y-auto px-5 py-5 xl:pt-[21px]">
               <IssuePropertiesPanel
                  issue={issue}
                  detail={detail}
                  onChanged={() => setReloadKey((k) => k + 1)}
               />
            </div>
         </DetailSidePanel>
      </div>
   );
}

/**
 * Issue detail page (rota /issue/[issueId]): resolve a issue pelo identifier
 * (store ou API no deep-link frio) e renderiza o corpo completo.
 */
export default function IssueDetails() {
   const { orgId, issueId } = useParams<{ orgId: string; issueId: string }>();
   const setCurrent = useCurrentIssueStore((s) => s.setCurrent);
   const clearCurrent = useCurrentIssueStore((s) => s.clear);

   // Issue do store (se já hidratado) — reusa sem request. `find` DENTRO do seletor
   // (referência estável): evento de outra issue não re-renderiza a página.
   const storeIssue = useIssuesStore((s) =>
      s.issues.find((candidate) => candidate.identifier === issueId)
   );
   // Fallback: se o deep-link foi aberto direto (store ainda vazio), busca a issue por
   // identifier na API — sem esperar o board inteiro hidratar (fim do waterfall de ~500).
   // undefined = ainda buscando; null = buscou e não existe; Issue = encontrada.
   const [fetchedIssue, setFetchedIssue] = useState<Issue | null | undefined>(undefined);
   const issue = storeIssue ?? fetchedIssue ?? undefined;
   const resolvingIssue = !storeIssue && fetchedIssue === undefined;

   // Publica a issue atual para o header (breadcrumb com pai, título, ações) — mesma
   // fonte que a página usa; limpa ao sair da rota.
   useEffect(() => {
      if (issue) setCurrent(issue, useCurrentIssueStore.getState().detail);
   }, [issue, setCurrent]);
   useEffect(() => () => clearCurrent(), [clearCurrent]);

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
      // Ainda resolvendo o deep-link → loading (não "not found" prematuro).
      if (resolvingIssue) return <LoadingArea className="h-full" />;
      return (
         <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
            <p>Issue {issueId} not found.</p>
            <Link href={`/${orgId ?? 'nimbloo'}`} className="underline">
               Back to issues
            </Link>
         </div>
      );
   }

   return <IssueDetailView issue={issue} onDetailLoaded={(detail) => setCurrent(issue, detail)} />;
}
