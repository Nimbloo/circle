'use client';

import { Button } from '@/components/ui/button';
import type { GuideSection, Review, ReviewGuide as ReviewGuideData } from '@/data/reviews';
import { generateReviewGuide } from '@/lib/adapters-reviews';
import { ApiError } from '@/lib/client';
import { patchToLines } from '@/lib/diff-patch';
import { FileCode2, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DiffView } from './diff-view';
import { DiffStat, InlineText, PrIcon } from './review-shared';

/** Mensagem honesta por status da API (o backend fala pt-BR; a UI é em inglês). */
function errorMessage(e: unknown): string {
   if (e instanceof ApiError) {
      if (e.status === 409) return 'This review has no files yet. Sync the pull request first.';
      if (e.status === 503)
         return 'Guide generation is unavailable right now (model not configured or down).';
      if (e.status === 502) return 'The model returned an unusable guide. Try again.';
      if (e.status === 404) return 'Review not found.';
   }
   return 'Could not generate the guide.';
}

/** Diff do arquivo da seção (`diffName` = nome do arquivo; primeiro match nos files do PR). */
function SectionDiff({ review, section }: { review: Review; section: GuideSection }) {
   const file = review.files.find((f) => f.name === section.diffName);
   if (!file) return null;
   const lines = patchToLines(file.patch);
   if (lines.length === 0) {
      return (
         <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm bg-container">
            <FileCode2 className="size-4 text-muted-foreground shrink-0" />
            <span className="font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground truncate">{file.path}</span>
            <span className="flex-1" />
            <DiffStat additions={file.additions} deletions={file.deletions} />
            <span className="text-xs text-muted-foreground">No diff</span>
         </div>
      );
   }
   return (
      <DiffView
         diff={{
            name: file.name,
            path: file.path,
            additions: file.additions,
            deletions: file.deletions,
            lines,
         }}
      />
   );
}

/**
 * Guide tab: narrated walk-through generated from the PR diff, each section next to
 * the diff it talks about. Without a guide, an empty state offers to generate one; the
 * success toast only fires after the API confirms.
 */
export function ReviewGuide({ review }: { review: Review }) {
   const [guide, setGuide] = useState<ReviewGuideData | null>(review.guide ?? null);
   const [generating, setGenerating] = useState(false);
   const hasFiles = review.files.length > 0;

   const generate = async () => {
      setGenerating(true);
      try {
         const next = await generateReviewGuide(review.id);
         setGuide(next);
         toast.success(guide ? 'Guide regenerated' : 'Guide generated');
      } catch (e) {
         toast.error(errorMessage(e));
      } finally {
         setGenerating(false);
      }
   };

   return (
      <div className="h-full overflow-y-auto relative">
         <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-10">
            <div className="flex items-start justify-between gap-4">
               <div className="flex flex-col gap-1.5 min-w-0">
                  <h1 className="text-2xl font-semibold leading-snug">{review.title}</h1>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono flex-wrap">
                     <PrIcon status={review.status} className="size-3.5" />
                     <span>
                        {review.repo}#{review.prNumber}
                     </span>
                     <span>·</span>
                     <span>
                        {review.targetBranch} ← {review.sourceBranch}
                     </span>
                  </div>
               </div>
               {guide && (
                  <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                     <span className="hidden sm:inline">
                        Generated {new Date(guide.generatedAt).toLocaleDateString()}
                     </span>
                     <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={generate}
                        disabled={generating}
                        aria-label="Regenerate guide"
                     >
                        {generating ? (
                           <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                           <RefreshCw className="size-3.5" />
                        )}
                        Regenerate
                     </Button>
                  </div>
               )}
            </div>

            {!guide ? (
               <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <Sparkles className="size-6 text-muted-foreground" />
                  <div className="flex flex-col gap-1">
                     <span className="text-sm font-medium">No guide yet</span>
                     <span className="text-xs text-muted-foreground max-w-sm">
                        {hasFiles
                           ? 'Generate a narrated walk-through of this pull request from its diff: what changes, why, where to look and the risks.'
                           : 'This review has no files yet. Sync the pull request before generating a guide.'}
                     </span>
                  </div>
                  <Button
                     type="button"
                     size="sm"
                     onClick={generate}
                     disabled={generating || !hasFiles}
                  >
                     {generating ? (
                        <>
                           <Loader2 className="size-4 animate-spin" />
                           Generating…
                        </>
                     ) : (
                        <>
                           <Sparkles className="size-4" />
                           Generate guide
                        </>
                     )}
                  </Button>
               </div>
            ) : (
               <div className="flex flex-col gap-12">
                  {guide.sections.map((section, index) => (
                     <section
                        key={`${index}-${section.title}`}
                        className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
                     >
                        <div className="flex flex-col gap-3 min-w-0">
                           <h2 className="text-base font-semibold leading-snug">{section.title}</h2>
                           {section.paragraphs.map((paragraph, i) => (
                              <p key={i} className="text-sm leading-relaxed text-foreground/90">
                                 <InlineText text={paragraph} />
                              </p>
                           ))}
                           {section.fileRefs.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                 {section.fileRefs.map((ref) => (
                                    <span
                                       key={`${ref.path}/${ref.name}`}
                                       className="inline-flex items-center gap-1.5 rounded-md border bg-container px-2 py-1 text-xs"
                                       title={ref.path ? `${ref.path}/${ref.name}` : ref.name}
                                    >
                                       <FileCode2 className="size-3.5 text-muted-foreground shrink-0" />
                                       <span className="font-medium">{ref.name}</span>
                                       {ref.stat && (
                                          <span className="text-muted-foreground font-mono">
                                             {ref.stat}
                                          </span>
                                       )}
                                    </span>
                                 ))}
                              </div>
                           )}
                        </div>
                        <div className="min-w-0">
                           <SectionDiff review={review} section={section} />
                        </div>
                     </section>
                  ))}
               </div>
            )}
         </div>

         <div className="sticky bottom-4 flex justify-center pointer-events-none">
            <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full border bg-container shadow-sm px-4 py-1.5 text-xs text-muted-foreground">
               {review.files.length} files changed
               <DiffStat additions={review.additions} deletions={review.deletions} />
            </span>
         </div>
      </div>
   );
}
