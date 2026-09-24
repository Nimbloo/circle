'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { FileDiff, ReviewComment } from '@/data/reviews';
import {
   ArrowDownToLine,
   ChevronDown,
   ChevronRight,
   FileCode2,
   MessageSquarePlus,
} from 'lucide-react';
import { Fragment, memo, useEffect, useMemo, useState } from 'react';
import {
   ReviewCommentComposer,
   ReviewCommentItem,
   type ReviewCommentsHandle,
} from './review-comments';
import { DiffStat } from './review-shared';
import { CODE_FONT_MEDIUM, usePreferencesStore } from '@/store/preferences-store';

/** Acima disto o arquivo abre colapsado (GitHub: "Load diff") — milhares de linhas no DOM. */
export const LARGE_DIFF_LINES = 400;

const NO_COMMENTS: ReviewComment[] = [];

/**
 * "Reviewed" por review+arquivo: persistido no servidor (escopo do usuário — #XX), o
 * localStorage vira só CACHE INICIAL (pinta na hora, antes do `GET file-states`
 * responder) e é reconciliado assim que `handle.reviewedPaths` chega.
 */
function reviewedKey(reviewId: string) {
   return `circle:review-viewed:${reviewId}`;
}
function readReviewed(reviewId: string | undefined, path: string): boolean {
   if (!reviewId) return false;
   try {
      const raw = window.localStorage.getItem(reviewedKey(reviewId));
      return raw ? (JSON.parse(raw) as string[]).includes(path) : false;
   } catch {
      return false;
   }
}
function writeReviewed(reviewId: string | undefined, path: string, value: boolean) {
   if (!reviewId) return;
   try {
      const raw = window.localStorage.getItem(reviewedKey(reviewId));
      const set = new Set(raw ? (JSON.parse(raw) as string[]) : []);
      if (value) set.add(path);
      else set.delete(path);
      window.localStorage.setItem(reviewedKey(reviewId), JSON.stringify([...set]));
   } catch {
      // storage indisponível: vale só nesta tela
   }
}

/**
 * One file diff: header (name, path, stats, Reviewed) + unified code view. Com `handle`,
 * vira comentável: "Add comment" no cabeçalho (comentário do arquivo) e clique no número da
 * linha abre um composer ancorado (`filePath` + `line`); os comentários da linha aparecem
 * logo abaixo dela. Só linhas do arquivo NOVO têm número — remoções não são ancoráveis.
 */
function DiffViewImpl({
   diff,
   filePath,
   comments = NO_COMMENTS,
   handle,
   serverReviewed,
}: {
   diff: FileDiff;
   /** Caminho completo do arquivo (âncora `path` dos comentários). Default: `path/name`. */
   filePath?: string;
   comments?: ReviewComment[];
   handle?: ReviewCommentsHandle;
   /** "Reviewed" deste arquivo no servidor; `undefined` enquanto ele não respondeu. */
   serverReviewed?: boolean;
}) {
   const path = filePath ?? (diff.path ? `${diff.path}/${diff.name}` : diff.name);
   // Preferência "Font" de Code & reviews: 12px regular (default) ou 13px medium.
   const mediumCode = usePreferencesStore((s) => s.codeFont === CODE_FONT_MEDIUM);
   const [fileComposer, setFileComposer] = useState(false);
   const [activeLine, setActiveLine] = useState<number | null>(null);
   const commentable = !!handle;
   // "Reviewed" colapsa o arquivo (e é lembrado por review); arquivo grande começa
   // colapsado até pedir "Load diff" (#47).
   const [reviewed, setReviewed] = useState(() => readReviewed(handle?.reviewId, path));
   // O servidor é a fonte da verdade assim que responde — reconcilia e atualiza o cache.
   const reviewId = handle?.reviewId;
   useEffect(() => {
      if (serverReviewed === undefined) return;
      setReviewed(serverReviewed);
      writeReviewed(reviewId, path, serverReviewed);
   }, [serverReviewed, reviewId, path]);
   const [loadLarge, setLoadLarge] = useState(false);
   const large = diff.lines.length > LARGE_DIFF_LINES;
   const showBody = !reviewed && (!large || loadLarge);

   const { fileComments, byLine } = useMemo(() => {
      const file: ReviewComment[] = [];
      const lines = new Map<number, ReviewComment[]>();
      for (const c of comments) {
         if (c.line == null) file.push(c);
         else lines.set(c.line, [...(lines.get(c.line) ?? []), c]);
      }
      return { fileComments: file, byLine: lines };
   }, [comments]);

   return (
      <div className="rounded-lg border overflow-hidden bg-container">
         <div className="flex items-center gap-2 px-3 py-2 border-b bg-sidebar/50 text-sm">
            {reviewed ? (
               <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            ) : (
               <FileCode2 className="size-4 text-muted-foreground shrink-0" />
            )}
            <span className="font-medium">{diff.name}</span>
            {diff.path && (
               <span className="text-xs text-muted-foreground truncate">{diff.path}/</span>
            )}
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
            {handle && (
               <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox
                     className="size-3.5"
                     checked={reviewed}
                     onCheckedChange={(value) => {
                        const next = value === true;
                        setReviewed(next);
                        writeReviewed(handle.reviewId, path, next);
                        handle.setFileReviewed(path, next).catch(() => {
                           setReviewed(!next);
                           writeReviewed(handle.reviewId, path, !next);
                        });
                     }}
                  />
                  Reviewed
               </label>
            )}
         </div>
         {showBody && handle && (fileComposer || fileComments.length > 0) && (
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
         {!reviewed && large && !loadLarge && (
            <button
               type="button"
               onClick={() => setLoadLarge(true)}
               className="flex w-full items-center justify-center gap-1.5 py-3 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
            >
               <ChevronDown className="size-3.5" />
               Load diff ({diff.lines.length} lines)
            </button>
         )}
         {showBody && (
            <div
               className={cn(
                  'font-mono leading-5 overflow-x-auto',
                  mediumCode ? 'text-[13px] font-medium' : 'text-xs'
               )}
            >
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
                              <span className={gutterClass}>
                                 {line.type === 'del' ? '-' : number}
                              </span>
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
         )}
      </div>
   );
}

/**
 * Memoizado (#47): um evento que recarrega o review (comentário em outro arquivo, checks)
 * re-renderiza só o arquivo cujas props mudaram. `diff` é comparado por campo — o objeto
 * é recriado a cada render do pai, mas `lines` vem memoizado de `patchToLines`.
 */
export const DiffView = memo(DiffViewImpl, (prev, next) => {
   const a = prev.diff;
   const b = next.diff;
   return (
      a.name === b.name &&
      a.path === b.path &&
      a.additions === b.additions &&
      a.deletions === b.deletions &&
      a.lines === b.lines &&
      prev.filePath === next.filePath &&
      prev.comments === next.comments &&
      prev.handle === next.handle &&
      prev.serverReviewed === next.serverReviewed
   );
});
