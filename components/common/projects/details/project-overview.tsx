'use client';

import { ContentBlocks } from '@/components/common/issues/details/content-blocks';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { adaptProjectDetail, emptyProjectDetail } from '@/lib/adapters-project-detail';
import { api } from '@/lib/client';
import type { ProjectDetail } from '@/mock-data/project-details';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { format, parseISO } from 'date-fns';
import { ArrowRight, ChevronDown, FileText, PenLine, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DocumentOutline, getOutlineItems } from './document-outline';
import { ProjectSidePanel } from './project-side-panel';

interface ProjectOverviewProps {
   projectId: string;
}

const formatDay = (iso?: string) => (iso ? format(parseISO(iso), 'MMM do') : '—');

/** Project "Overview" tab: description column + properties side panel. */
export default function ProjectOverview({ projectId }: ProjectOverviewProps) {
   const project = useWorkspaceStore((s) => s.getProjectById(projectId));
   const loaded = useWorkspaceStore((s) => s.loaded);
   const { issues: allIssues } = useIssuesStore();
   const { orgId } = useParams<{ orgId: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const scrollRef = useRef<HTMLDivElement>(null);

   const [detail, setDetail] = useState<ProjectDetail>(() => emptyProjectDetail(projectId));
   const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
   const reload = useCallback(async () => {
      try {
         setDetail(adaptProjectDetail(await api.projects.detail(projectId)));
      } catch {
         setDetail(emptyProjectDetail(projectId));
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

   const handleAddResource = async () => {
      const label = window.prompt('Resource label');
      if (!label?.trim()) return;
      const url = window.prompt('Resource URL', 'https://');
      if (!url?.trim()) return;
      try {
         await api.projects.addResource(projectId, { label: label.trim(), url: url.trim() });
         await reload();
         toast.success('Resource added');
      } catch {
         toast.error('Could not add the resource');
      }
   };

   const issues = useMemo(
      () => allIssues.filter((issue) => issue.project?.id === projectId),
      [allIssues, projectId]
   );
   const team = teams.find((candidate) => candidate.id === project?.teamId);
   const outlineItems = useMemo(() => getOutlineItems(detail.description), [detail.description]);

   if (!project) {
      return (
         <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {loaded ? 'Project not found.' : 'Loading…'}
         </div>
      );
   }

   return (
      <div className="w-full h-full flex overflow-hidden">
         {/* Main column */}
         <div className="flex-1 min-w-0 h-full relative">
            <DocumentOutline items={outlineItems} scrollRef={scrollRef} />
            <div ref={scrollRef} className="h-full overflow-y-auto">
               <div className="max-w-3xl mx-auto px-6 lg:px-10 py-10">
                  <div className="inline-flex size-10 bg-muted/50 items-center justify-center rounded-md mb-4">
                     <project.icon className="size-6" />
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
                  {summaryDraft !== null ? (
                     <div className="mt-3">
                        <textarea
                           value={summaryDraft}
                           onChange={(event) => setSummaryDraft(event.target.value)}
                           autoFocus
                           placeholder="Add a one-line summary…"
                           className="w-full min-h-16 resize-y bg-transparent text-muted-foreground leading-relaxed outline-none border rounded-md p-2"
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
                        className="mt-3 block w-full text-left text-muted-foreground leading-relaxed hover:text-foreground transition-colors"
                     >
                        {detail.summary || 'Add a one-line summary…'}
                     </button>
                  )}

                  {/* Inline properties */}
                  <div className="mt-6 flex flex-col gap-2.5 text-sm">
                     <div className="flex items-center gap-3">
                        <span className="w-24 text-muted-foreground shrink-0">Properties</span>
                        <div className="flex items-center gap-3 flex-wrap">
                           <span className="inline-flex items-center gap-1.5">
                              <project.status.icon />
                              {project.status.name}
                           </span>
                           <span className="inline-flex items-center gap-1.5">
                              <project.priority.icon className="size-3.5 text-muted-foreground" />
                              {project.priority.name}
                           </span>
                           <span className="inline-flex items-center gap-1.5">
                              {project.lead && (
                                 <Avatar className="size-4">
                                    <AvatarImage
                                       src={project.lead.avatarUrl}
                                       alt={project.lead.name}
                                    />
                                    <AvatarFallback>{project.lead.name[0]}</AvatarFallback>
                                 </Avatar>
                              )}
                              {project.lead?.name ?? '—'}
                           </span>
                           <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              {formatDay(project.startDate)}
                              <ArrowRight className="size-3" />
                              {formatDay(project.targetDate)}
                           </span>
                           {team && (
                              <span className="inline-flex items-center gap-1.5">
                                 {team.icon} {team.name}
                              </span>
                           )}
                        </div>
                     </div>

                     {project.initiative && (
                        <div className="flex items-center gap-3">
                           <span className="w-24 text-muted-foreground shrink-0">Initiatives</span>
                           <span className="inline-flex items-center gap-1.5">
                              📄 {project.initiative}
                              <button className="text-muted-foreground hover:text-foreground transition-colors">
                                 <Plus className="size-3.5" />
                              </button>
                           </span>
                        </div>
                     )}

                     <div className="flex items-center gap-3">
                        <span className="w-24 text-muted-foreground shrink-0">Labels</span>
                        <div className="flex items-center gap-1.5">
                           {project.labels.map((label) => (
                              <span
                                 key={label.id}
                                 className="inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5"
                              >
                                 <span
                                    className="size-2 rounded-full"
                                    style={{ backgroundColor: label.color }}
                                 />
                                 {label.name}
                                 <ChevronDown className="size-3 text-muted-foreground" />
                              </span>
                           ))}
                           <button className="text-muted-foreground hover:text-foreground transition-colors">
                              <Plus className="size-3.5" />
                           </button>
                        </div>
                     </div>

                     <div className="flex items-center gap-3">
                        <span className="w-24 text-muted-foreground shrink-0">Resources</span>
                        <div className="flex items-center gap-2 flex-wrap">
                           {detail.resources.map((resource) => (
                              <a
                                 key={resource.label}
                                 href={resource.url}
                                 className="inline-flex items-center gap-1.5 text-xs border rounded-md px-2 py-1 hover:bg-accent/50 transition-colors"
                              >
                                 <FileText className="size-3.5 text-muted-foreground" />
                                 {resource.label}
                              </a>
                           ))}
                           <button
                              type="button"
                              onClick={handleAddResource}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                           >
                              <Plus className="size-3.5" />
                           </button>
                        </div>
                     </div>
                  </div>

                  {/* Update CTA */}
                  <Link
                     href={`/${orgId}/project/${project.id}/activity`}
                     className="mt-8 flex items-center justify-center gap-2 border rounded-lg py-4 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
                  >
                     <PenLine className="size-4" />
                     Write {detail.updates.length === 0 ? 'first ' : ''}project update
                  </Link>

                  {/* Description */}
                  <div className="mt-10">
                     <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground mb-2">
                        Description
                        <ChevronDown className="size-3.5" />
                     </div>
                     <div className="text-[15px] leading-relaxed">
                        <ContentBlocks blocks={detail.description} />
                     </div>
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
