'use client';

import { api } from '@/lib/client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Eye, FileText, Pencil } from 'lucide-react';
import { MarkdownToolbar } from '@/components/common/editor/markdown-toolbar';
import { ContentBlocks } from '@/components/common/issues/details/content-blocks';
import { textToBlocks } from '@/lib/adapters-issue-detail';
import { cn } from '@/lib/utils';

/**
 * Editor de documento (estilo Linear): título + conteúdo markdown, com a MESMA
 * toolbar de formatação do composer de comentário e um toggle Edit/Preview que
 * renderiza o markdown pelo mesmo renderer de blocos do feed. Autosave debounced
 * (PATCH /documents/{id}). É pra cá que o "Add document" redireciona depois de
 * criar e linkar o documento na issue.
 */
export function DocumentEditor({ documentId }: { documentId: string }) {
   const router = useRouter();
   const [title, setTitle] = useState('');
   const [content, setContent] = useState('');
   const [loading, setLoading] = useState(true);
   const [savedAt, setSavedAt] = useState<string | null>(null);
   const [preview, setPreview] = useState(false);
   const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
   const taRef = useRef<HTMLTextAreaElement>(null);

   useEffect(() => {
      let active = true;
      api.documents
         .get(documentId)
         .then((d) => {
            if (!active) return;
            setTitle(d.title);
            setContent(d.content);
            setSavedAt(d.updatedAt);
         })
         .catch(() => toast.error('Documento não encontrado'))
         .finally(() => active && setLoading(false));
      return () => {
         active = false;
      };
   }, [documentId]);

   // Autosave debounced (600ms após parar de digitar).
   const scheduleSave = (patch: { title?: string; content?: string }) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
         api.documents
            .update(documentId, patch)
            .then((d) => setSavedAt(d.updatedAt))
            .catch(() => toast.error('Falha ao salvar'));
      }, 600);
   };

   const changeContent = (next: string) => {
      setContent(next);
      scheduleSave({ content: next });
   };

   if (loading) {
      return (
         <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Loading…
         </div>
      );
   }

   return (
      <div className="w-full h-full overflow-y-auto">
         <div className="max-w-3xl mx-auto px-8 py-10">
            <div className="flex items-center justify-between mb-6">
               <button
                  onClick={() => router.back()}
                  className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
               >
                  <ArrowLeft className="size-3.5" /> Back
               </button>
               <button
                  onClick={() => setPreview((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground rounded px-2 py-1 hover:bg-accent/60"
               >
                  {preview ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
                  {preview ? 'Edit' : 'Preview'}
               </button>
            </div>

            <div className="flex items-center gap-2 mb-4 text-muted-foreground">
               <FileText className="size-5" />
               {savedAt && <span className="text-xs">Saved</span>}
            </div>

            <input
               value={title}
               onChange={(e) => {
                  setTitle(e.target.value);
                  scheduleSave({ title: e.target.value });
               }}
               placeholder="Untitled document"
               disabled={preview}
               className="w-full bg-transparent text-3xl font-semibold leading-tight outline-none placeholder:text-muted-foreground/60 mb-6"
            />

            {preview ? (
               <div className="min-h-[60vh] text-[15px] leading-relaxed">
                  {content.trim() ? (
                     <ContentBlocks blocks={textToBlocks(content)} />
                  ) : (
                     <p className="text-muted-foreground/60">Nothing to preview yet.</p>
                  )}
               </div>
            ) : (
               <>
                  <div className="mb-2 pb-2 border-b border-border/60">
                     <MarkdownToolbar textareaRef={taRef} value={content} onChange={changeContent} />
                  </div>
                  <textarea
                     ref={taRef}
                     value={content}
                     onChange={(e) => changeContent(e.target.value)}
                     placeholder="Write something…"
                     className={cn(
                        'w-full min-h-[60vh] resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60'
                     )}
                  />
               </>
            )}
         </div>
      </div>
   );
}
