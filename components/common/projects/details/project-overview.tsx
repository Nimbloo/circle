'use client';

import { DetailSidePanel, DetailSidePanelTrigger } from '@/components/common/detail-side-panel';
import { BlockEditor } from '@/components/common/editor/block-editor';
import { Button } from '@/components/ui/button';
import { adaptProjectDetail, emptyProjectDetail } from '@/lib/adapters-project-detail';
import { api } from '@/lib/client';
import { blocksToDoc, docHeadings, type EditorDoc } from '@/lib/editor-doc';
import type { ProjectDetail } from '@/data/project-details';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { ChevronDown, PenLine } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DocumentOutline, type OutlineItem } from './document-outline';
import { ProjectResources } from './project-resources';
import { ProjectSidePanel } from './project-side-panel';
import { Skeleton } from '@/components/ui/skeleton';

interface ProjectOverviewProps {
   projectId: string;
}

/** Project "Overview" tab: description column + properties side panel. */
export default function ProjectOverview({ projectId }: ProjectOverviewProps) {
   const project = useWorkspaceStore((s) => s.getProjectById(projectId));
   const loaded = useWorkspaceStore((s) => s.loaded);
   const allIssues = useIssuesStore((s) => s.issues);
   const { orgId } = useParams<{ orgId: string }>();
   const scrollRef = useRef<HTMLDivElement>(null);

   const [detail, setDetail] = useState<ProjectDetail>(() => emptyProjectDetail(projectId));
   const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
   // O editor só monta depois da 1ª carga: montar vazio e receber o doc depois
   // arriscaria o usuário começar a digitar sobre o vazio e sobrescrever a descrição.
   const [detailReady, setDetailReady] = useState(false);
   const reload = useCallback(async () => {
      try {
         setDetail(adaptProjectDetail(await api.projects.detail(projectId)));
      } catch {
         // Falha de REFETCH não apaga o detail já exibido (antes zerava a tela
         // com emptyProjectDetail num erro transitório); a 1ª carga tem o próprio
         // catch no useEffect abaixo.
      }
   }, [projectId]);
   useEffect(() => {
      let active = true;
      api.projects
         .detail(projectId)
         .then((dto) => {
            if (active) setDetail(adaptProjectDetail(dto));
         })
         .catch(() => {
            if (active) setDetail(emptyProjectDetail(projectId));
         })
         .finally(() => {
            if (active) setDetailReady(true);
         });
      return () => {
         active = false;
      };
   }, [projectId]);

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

   const issues = useMemo(
      () => allIssues.filter((issue) => issue.project?.id === projectId),
      [allIssues, projectId]
   );

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

   const saveDescription = async (next: EditorDoc) => {
      try {
         await api.projects.updateDetail(projectId, { descriptionDoc: next });
      } catch {
         toast.error('Could not save the description');
      }
   };

   if (!project) {
      // Ainda carregando → skeleton; carregado sem projeto → not found.
      if (!loaded) {
         return (
            <div className="flex h-full w-full overflow-hidden">
               <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="mx-auto flex max-w-[869px] flex-col gap-5 px-8 pt-16 pb-10">
                     <Skeleton className="size-8" />
                     <Skeleton className="h-8 w-1/2" />
                     <Skeleton className="h-4 w-3/4" />
                  </div>
               </div>
               <DetailSidePanel kind="project" title="Project details" className="flex-col gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                     <div key={i} className="flex flex-col gap-2 rounded-[10px] border bg-card p-3">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-6 w-32" />
                     </div>
                  ))}
               </DetailSidePanel>
            </div>
         );
      }
      return (
         <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Project not found.
         </div>
      );
   }

   return (
      <div className="relative w-full h-full flex overflow-hidden">
         {/* Main column */}
         <div className="flex-1 min-w-0 h-full relative">
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
                           key={projectId}
                           doc={doc}
                           placeholder="Add a description…"
                           onChange={setLiveDoc}
                           onSave={saveDescription}
                           onReady={markHeadings}
                        />
                     ) : (
                        <Skeleton className="h-4 w-2/3" />
                     )}
                  </div>
               </div>
            </div>
         </div>

         {/* Side panel */}
         <ProjectSidePanel
            project={project}
            detail={detail}
            issues={issues}
            projectId={projectId}
            onChanged={reload}
         />
      </div>
   );
}
