'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { FileDiff, ReviewComment } from '@/data/reviews';
import { ArrowDownToLine, FileCode2, MessageSquarePlus } from 'lucide-react';
import { Fragment, useState } from 'react';
import {
   ReviewCommentComposer,
   ReviewCommentItem,
   type ReviewCommentsHandle,
} from './review-comments';
import { DiffStat } from './review-shared';

/**
 * One file diff: header (name, path, stats, Reviewed) + unified code view. Com `handle`,
 * vira comentável: "Add comment" no cabeçalho (comentário do arquivo) e clique no número da
 * linha abre um composer ancorado (`filePath` + `line`); os comentários da linha aparecem
 * logo abaixo dela. Só linhas do arquivo NOVO têm número — remoções não são ancoráveis.
 */
export function DiffView({
   diff,
   filePath,
   comments = [],
   handle,
}: {
   diff: FileDiff;
   /** Caminho completo do arquivo (âncora `path` dos comentários). Default: `path/name`. */
   filePath?: string;
   comments?: ReviewComment[];
   handle?: ReviewCommentsHandle;
}) {
   const path = filePath ?? (diff.path ? `${diff.path}/${diff.name}` : diff.name);
   const [fileComposer, setFileComposer] = useState(false);
   const [activeLine, setActiveLine] = useState<number | null>(null);
   const commentable = !!handle;

   const fileComments = comments.filter((c) => c.line == null);
   const byLine = new Map<number, ReviewComment[]>();
   for (const c of comments) {
      if (c.line == null) continue;
      byLine.set(c.line, [...(byLine.get(c.line) ?? []), c]);
   }

   return (
      <div className="rounded-lg border overflow-hidden bg-container">
         <div className="flex items-center gap-2 px-3 py-2 border-b bg-sidebar/50 text-sm">
            <FileCode2 className="size-4 text-muted-foreground shrink-0" />
            <span className="font-medium">{diff.name}</span>
            <span className="text-xs text-muted-foreground truncate">{diff.path}/</span>
            <span className="flex-1" />
            <DiffStat additions={diff.additions} deletions={diff.deletions} />
            {commentable && (
               <button
                  type="button"
                  onClick={() => setFileComposer((open) => !open)}
                  aria-expanded={fileComposer}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
               >
                  <MessageSquarePlus className="size-3.5" />
                  Add comment
               </button>
            )}
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
               <Checkbox className="size-3.5" />
               Reviewed
            </label>
         </div>
         {handle && (fileComposer || fileComments.length > 0) && (
            <div className="flex flex-col gap-2 border-b bg-sidebar/30 px-3 py-2">
               {fileComments.map((comment) => (
                  <ReviewCommentItem key={comment.id} comment={comment} handle={handle} />
               ))}
               {fileComposer && (
                  <ReviewCommentComposer
                     handle={handle}
                     path={path}
                     autoFocus
                     placeholder={`Comment on ${diff.name}...`}
                     onPosted={() => setFileComposer(false)}
                     onCancel={() => setFileComposer(false)}
                  />
               )}
            </div>
         )}
         <div className="font-mono text-xs leading-5 overflow-x-auto">
            {diff.lines.map((line, index) => {
               if (line.type === 'skip') {
                  return (
                     <div
                        key={index}
                        className="flex items-center justify-center gap-1.5 py-1.5 text-muted-foreground bg-sidebar/40 border-y border-border/40"
                     >
                        <ArrowDownToLine className="size-3" />
                        {line.count} unchanged lines
                     </div>
                  );
               }
               const number = line.number;
               const anchored = number != null ? byLine.get(number) : undefined;
               const composing = number != null && activeLine === number;
               const gutterClass = cn(
                  'w-10 shrink-0 text-right pr-2 select-none text-muted-foreground/60 border-r border-border/40',
                  line.type === 'add' && 'border-l-2 border-l-emerald-500',
                  line.type === 'del' && 'border-l-2 border-l-red-500'
               );
               return (
                  <Fragment key={index}>
                     <div
                        className={cn(
                           'flex group/line',
                           line.type === 'add' && 'bg-emerald-500/10',
                           line.type === 'del' && 'bg-red-500/10'
                        )}
                     >
                        {commentable && number != null ? (
                           <button
                              type="button"
                              onClick={() => setActiveLine(composing ? null : number)}
                              aria-label={`Comment on line ${number}`}
                              className={cn(
                                 gutterClass,
                                 'relative cursor-pointer hover:text-foreground',
                                 composing && 'text-foreground'
                              )}
                           >
                              {number}
                              <MessageSquarePlus className="absolute left-0.5 top-1 size-3 opacity-0 group-hover/line:opacity-100 text-muted-foreground" />
                           </button>
                        ) : (
                           <span className={gutterClass}>{line.type === 'del' ? '-' : number}</span>
                        )}
                        <pre className="px-3 whitespace-pre">{line.text}</pre>
                     </div>
                     {handle && (!!anchored?.length || composing) && (
                        <div className="flex flex-col gap-2 border-y border-border/40 bg-sidebar/30 px-3 py-2">
                           {anchored?.map((comment) => (
                              <ReviewCommentItem
                                 key={comment.id}
                                 comment={comment}
                                 handle={handle}
                              />
                           ))}
                           {composing && (
                              <ReviewCommentComposer
                                 handle={handle}
                                 path={path}
                                 line={number}
                                 autoFocus
                                 placeholder={`Comment on line ${number}...`}
                                 onPosted={() => setActiveLine(null)}
                                 onCancel={() => setActiveLine(null)}
                              />
                           )}
                        </div>
                     )}
                  </Fragment>
               );
            })}
         </div>
      </div>
   );
}
