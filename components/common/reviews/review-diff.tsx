'use client';

import { TimeAgo } from './time-ago';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
   DropdownMenu,
   DropdownMenuCheckboxItem,
   DropdownMenuContent,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { patchToLines } from '@/lib/diff-patch';
import type { Review, ReviewComment, ReviewFileStat } from '@/data/reviews';
import { DiffView } from './diff-view';
import type { ReviewCommentsHandle } from './review-comments';
import { DiffStat } from './review-shared';

/** Caminho completo do arquivo — é a âncora `path` dos comentários (como veio do GitHub). */
function fullPath(file: ReviewFileStat): string {
   return file.path ? `${file.path}/${file.name}` : file.name;
}

/** Âncora estável por caminho completo (dois arquivos podem ter o mesmo nome). */
function anchorId(file: ReviewFileStat): string {
   return `diff-${encodeURIComponent(fullPath(file))}`;
}
import {
   Check,
   FileCode2,
   GitCommitHorizontal,
   ListFilter,
   Search,
   SlidersHorizontal,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

/** Diff tab: Files / Commits toolbar, file list and stacked unified diffs (comentáveis). */
export function ReviewDiff({ review, handle }: { review: Review; handle: ReviewCommentsHandle }) {
   const [query, setQuery] = useState('');
   const [showFileTree, setShowFileTree] = useState(true);

   const files = useMemo(
      () =>
         review.files.filter((file) =>
            (file.name + file.path).toLowerCase().includes(query.trim().toLowerCase())
         ),
      [review.files, query]
   );

   // Comentários agrupados por arquivo UMA vez (antes: um `filter` por arquivo a cada
   // render). A lista de cada arquivo só muda de referência quando o conteúdo dele muda —
   // é o que deixa o `memo` do DiffView pular os outros arquivos (#47).
   const prevByPathRef = useRef(new Map<string, ReviewComment[]>());
   const commentsByPath = useMemo(() => {
      const grouped = new Map<string, ReviewComment[]>();
      for (const c of review.comments) {
         if (!c.path) continue;
         grouped.set(c.path, [...(grouped.get(c.path) ?? []), c]);
      }
      const prev = prevByPathRef.current;
      for (const [path, list] of grouped) {
         const old = prev.get(path);
         if (old && old.length === list.length && old.every((c, i) => c === list[i]))
            grouped.set(path, old);
      }
      prevByPathRef.current = grouped;
      return grouped;
   }, [review.comments]);

   return (
      <div className="h-full flex flex-col overflow-hidden">
         <div className="flex items-center justify-between gap-2 px-4 py-2 border-b shrink-0">
            <div className="flex items-center gap-1.5 text-xs">
               <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-accent font-medium">
                  <ListFilter className="size-3.5" />
                  Files
                  <span className="text-muted-foreground">{review.files.length}</span>
               </span>
               <Popover>
                  <PopoverTrigger asChild>
                     <button
                        type="button"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-muted-foreground hover:bg-accent/50 transition-colors"
                     >
                        <GitCommitHorizontal className="size-3.5" />
                        Commits
                        <span>{review.commits.length}</span>
                     </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-96 p-0 text-sm">
                     <div className="flex items-center justify-between px-3 py-2 border-b">
                        <span className="font-medium">All commits</span>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                           <Check className="size-3.5" />
                           {review.commits.length} commits
                        </span>
                     </div>
                     {review.commits.map((commit) => (
                        <div
                           key={commit.sha}
                           className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 text-xs"
                        >
                           <span className="font-mono text-muted-foreground">{commit.sha}</span>
                           <span className="flex-1 truncate">{commit.message}</span>
                           <span className="text-muted-foreground shrink-0">
                              <TimeAgo iso={commit.committedAt} fallback={commit.timeAgo} />
                           </span>
                        </div>
                     ))}
                  </PopoverContent>
               </Popover>
            </div>
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button
                     type="button"
                     size="icon"
                     variant="ghost"
                     className="size-7"
                     aria-label="Diff display options"
                  >
                     <SlidersHorizontal className="size-4 text-muted-foreground" />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuCheckboxItem
                     checked={showFileTree}
                     onCheckedChange={setShowFileTree}
                  >
                     Show file tree
                  </DropdownMenuCheckboxItem>
               </DropdownMenuContent>
            </DropdownMenu>
         </div>

         <div className="flex-1 min-h-0 flex overflow-hidden">
            <div
               className={cn(
                  'hidden flex-col w-64 shrink-0 border-r p-3 gap-2 overflow-y-auto',
                  showFileTree && 'md:flex'
               )}
            >
               <div className="relative shrink-0">
                  <Search className="size-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
                  <Input
                     placeholder="Filter files..."
                     value={query}
                     onChange={(event) => setQuery(event.target.value)}
                     className="pl-7 h-8 text-xs"
                  />
               </div>
               {files.map((file) => (
                  <a
                     key={file.path + '/' + file.name}
                     href={`#${anchorId(file)}`}
                     className={cn(
                        'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50 transition-colors'
                     )}
                  >
                     <FileCode2 className="size-3.5 text-muted-foreground shrink-0" />
                     <span className="font-medium truncate">{file.name}</span>
                     <span className="text-muted-foreground truncate">{file.path}</span>
                  </a>
               ))}
            </div>
            <div className="flex-1 min-w-0 overflow-y-auto p-4 flex flex-col gap-4">
               {files.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                     No file diffs available.
                  </div>
               ) : (
                  files.map((file) => {
                     const lines = patchToLines(file.patch);
                     const path = fullPath(file);
                     return (
                        <div
                           key={path}
                           id={anchorId(file)}
                           // Arquivos fora da tela não pagam layout/paint (#47).
                           className="[content-visibility:auto] [contain-intrinsic-size:auto_320px]"
                        >
                           {lines.length > 0 ? (
                              <DiffView
                                 diff={{
                                    name: file.name,
                                    path: file.path,
                                    additions: file.additions,
                                    deletions: file.deletions,
                                    lines,
                                 }}
                                 filePath={path}
                                 comments={commentsByPath.get(path)}
                                 handle={handle}
                              />
                           ) : (
                              // Sem patch (binário/arquivo grande): só o cabeçalho com o stat.
                              <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm bg-container">
                                 <FileCode2 className="size-4 text-muted-foreground shrink-0" />
                                 <span className="font-medium">{file.name}</span>
                                 <span className="text-xs text-muted-foreground truncate">
                                    {file.path}
                                 </span>
                                 <span className="flex-1" />
                                 <DiffStat additions={file.additions} deletions={file.deletions} />
                                 <span className="text-xs text-muted-foreground">No diff</span>
                              </div>
                           )}
                        </div>
                     );
                  })
               )}
            </div>
         </div>
      </div>
   );
}
