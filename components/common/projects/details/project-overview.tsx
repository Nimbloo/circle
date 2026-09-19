'use client';

import { EmptyState } from '@/components/common/empty-state';
import { DetailSidePanelTrigger } from '@/components/common/detail-side-panel';
import { BlockEditor } from '@/components/common/editor/block-editor';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/common/error-state';
import { api, ApiError } from '@/lib/client';
import { blocksToDoc, docHeadings, type EditorDoc } from '@/lib/editor-doc';
import { useWorkspaceStore } from '@/store/workspace-store';
import { ChevronDown, PenLine } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DocumentOutline, type OutlineItem } from './document-outline';
import { ProjectResources } from './project-resources';
import { useSharedProjectDetail } from './use-project-detail';
import { LoadingArea } from '@/components/common/loading-area';

interface ProjectOverviewProps {
   projectId: string;
}

/** Project "Overview" tab: description column + properties side panel. */
export default function ProjectOverview({ projectId }: ProjectOverviewProps) {
   const project = useWorkspaceStore((s) => s.getProjectById(projectId));
   const loaded = useWorkspaceStore((s) => s.loaded);
   const { orgId } = useParams<{ orgId: string }>();
   const scrollRef = useRef<HTMLDivElement>(null);

   // Detalhe compartilhado pelas abas (layout da rota, #45): loading/ready/error, live
   // reload e refetch que preserva a tela. O editor só monta com `ready` — montar vazio
   // (1ª carga falha ou em curso) e o autosave apagaria a descrição real (#34).
   const { status, detail, reload, setDetail, descriptionVersion, setDescriptionVersion } =
      useSharedProjectDetail(projectId);
   const detailReady = status === 'ready';
   const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
   // Concorrência otimista da descrição (#18): versão vista + fila de saves + conflito.
   const versionRef = useRef<string | null>(null);
   const saveQueue = useRef<Promise<void>>(Promise.resolve());
   const [editorEpoch, setEditorEpoch] = useState(0);

   const handleSaveSummary = async () => {
      if (summaryDraft === null) return;
      const value = summaryDraft.trim();
      setSummaryDraft(null);
      setDetail((d) => ({ ...d, summary: value })); // otimista
      try {
         await api.projects.updateDetail(projectId, { summary: value });
         toast.success('Summary updated');
      } catch {
         await reload();
         toast.error('Could not update the summary');
      }
   };

   // Descrição: doc do servidor ou conversão da projeção em blocos. `liveDoc` acompanha o
   // que está no editor (antes do save) para o outline reagir enquanto se digita.
   const doc = useMemo(
      () => detail.descriptionDoc ?? blocksToDoc(detail.description),
      [detail.descriptionDoc, detail.description]
   );
   const [liveDoc, setLiveDoc] = useState<EditorDoc | null>(null);
   const outlineItems = useMemo<OutlineItem[]>(
      () =>
         docHeadings(liveDoc ?? doc).map((h, index) => ({
            id: `doc-h-${index}`,
            text: h.text,
            level: h.level > 1 ? 2 : 1,
         })),
      [liveDoc, doc]
   );
   // O outline navega por `#doc-h-N`; o ProseMirror não emite ids, então marcamos os
   // headings renderizados (re-marcados a cada mudança de doc).
   const markHeadings = useCallback(() => {
      scrollRef.current
         ?.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3')
         .forEach((el, index) => {
            el.id = `doc-h-${index}`;
         });
   }, []);
   useEffect(markHeadings, [markHeadings, outlineItems]);

   // Saves em fila (um por vez) mandando a versão vista; 409 = outra pessoa gravou no
   // meio: recarrega a versão dela e remonta o editor em vez de sobrescrever.
   const saveDescription = (next: EditorDoc) => {
      saveQueue.current = saveQueue.current.then(async () => {
         try {
            const dto = await api.projects.updateDetail(projectId, {
               descriptionDoc: next,
               expectedDescriptionVersion: versionRef.current,
            });
            versionRef.current = dto.descriptionVersion ?? null;
            setDescriptionVersion(versionRef.current);
         } catch (e) {
            if (!(e instanceof ApiError && e.status === 409)) {
               toast.error('Could not save the description');
               return;
            }
            toast.warning(
               'The description was changed by someone else. Loaded the latest version.'
            );
            versionRef.current = null;
            await reload();
            setEditorEpoch((n) => n + 1);
         }
      });
   };
   // Versão vinda de recarga (1ª carga, evento remoto, conflito): só é adotada com o
   // editor SEM foco — é quando o editor também aceita o doc externo. Digitando, fica a
   // versão antiga e o próximo save detecta o conflito (409) em vez de sobrescrever.
   useEffect(() => {
      if (!descriptionVersion) return;
      const editing = scrollRef.current
         ?.querySelector('.ProseMirror')
         ?.contains(document.activeElement);
      if (!editing || versionRef.current === null) versionRef.current = descriptionVersion;
   }, [descriptionVersion]);

   if (project && status === 'error') {
      return (
         <ErrorState
            className="min-h-full"
            title="Could not load the project"
            description="Check your connection and try again."
            action={
               <Button size="sm" variant="outline" onClick={() => void reload()}>
                  Try again
               </Button>
            }
         />
      );
   }

   if (!project) {
      // Ainda carregando → loading; carregado sem projeto → not found.
      if (!loaded) return <LoadingArea className="h-full" />;
      return (
         <EmptyState
            variant="search"
            title="Project not found"
            description="It may have been deleted or you don't have access to it."
         />
      );
   }

   return (
      <div className="content-enter relative h-full w-full overflow-hidden">
         {/* Main column (o sidecar vem do layout do projeto, pl#6) */}
         <div className="relative h-full min-w-0">
            <DocumentOutline items={outlineItems} scrollRef={scrollRef} />
            <div ref={scrollRef} className="h-full overflow-y-auto">
               <div className="mx-auto max-w-[869px] px-8 pt-16 pb-10">
                  <div className="mb-3 flex items-start justify-between">
                     <div className="inline-flex size-8 items-center justify-center rounded-md bg-muted/50">
                        <project.icon className="size-5" />
                     </div>
                     <DetailSidePanelTrigger kind="project" />
                  </div>
                  <h1 className="text-2xl font-semibold leading-8 tracking-tight">
                     {project.name}
                  </h1>
                  {summaryDraft !== null ? (
                     <div className="mt-1">
                        <textarea
                           value={summaryDraft}
                           onChange={(event) => setSummaryDraft(event.target.value)}
                           autoFocus
                           placeholder="Add a one-line summary…"
                           className="min-h-16 w-full resize-y rounded-md border bg-transparent p-2 text-[15px] leading-6 text-muted-foreground outline-none"
                        />
                        <div className="mt-2 flex items-center gap-2">
                           <Button size="xs" onClick={handleSaveSummary}>
                              Save
                           </Button>
                           <Button size="xs" variant="ghost" onClick={() => setSummaryDraft(null)}>
                              Cancel
                           </Button>
                        </div>
                     </div>
                  ) : (
                     <button
                        type="button"
                        onClick={() => setSummaryDraft(detail.summary)}
                        className="mt-1 block w-full text-left text-[15px] leading-6 text-muted-foreground transition-colors hover:text-foreground"
                     >
                        {detail.summary || 'Add a one-line summary…'}
                     </button>
                  )}

                  {/* Propriedades só no painel lateral (como no Linear) — aqui fica só Resources. */}
                  <div className="mt-[19px] flex flex-col gap-3 text-sm">
                     <ProjectResources
                        projectId={projectId}
                        resources={detail.resources}
                        onChanged={reload}
                     />
                  </div>

                  {/* Update CTA */}
                  <Link
                     href={`/${orgId}/project/${project.id}/activity`}
                     className="-mx-4 mt-4 flex h-[66px] items-center justify-center gap-2 rounded-[10px] border text-sm text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
                  >
                     <PenLine className="size-4" />
                     Write {detail.updates.length === 0 ? 'first ' : ''}project update
                  </Link>

                  {/* Description */}
                  <div className="-mx-4 mt-7 rounded-xl px-4 pt-2.5">
                     <div className="mb-2 flex items-center gap-1 py-1.5 text-[13px] font-medium leading-4 text-muted-foreground">
                        Description
                        <ChevronDown className="size-3.5" />
                     </div>
                     {detailReady ? (
                        <BlockEditor
                           key={`${projectId}:${editorEpoch}`}
                           doc={doc}
                           placeholder="Add a description…"
                           onChange={setLiveDoc}
                           onSave={saveDescription}
                           onReady={markHeadings}
                        />
                     ) : (
                        <LoadingArea rows={1} size="sm" className="justify-start" />
                     )}
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
}
