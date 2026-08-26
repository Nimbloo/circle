'use client';

import { api } from '@/lib/client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, FileText } from 'lucide-react';

/**
 * Editor de documento (estilo Linear): título + conteúdo, com autosave debounced
 * (PATCH /documents/{id}). Backend real (`document`). É pra cá que o "Add document"
 * redireciona depois de criar e linkar o documento na issue.
 */
export function DocumentEditor({ documentId }: { documentId: string }) {
   const router = useRouter();
   const [title, setTitle] = useState('');
   const [content, setContent] = useState('');
   const [loading, setLoading] = useState(true);
   const [savedAt, setSavedAt] = useState<string | null>(null);
   const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            <button
               onClick={() => router.back()}
               className="inline-flex items-center gap-1.5 mb-6 text-[13px] text-muted-foreground hover:text-foreground"
            >
               <ArrowLeft className="size-3.5" /> Back
            </button>

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
               className="w-full bg-transparent text-3xl font-semibold leading-tight outline-none placeholder:text-muted-foreground/60 mb-6"
            />

            <textarea
               value={content}
               onChange={(e) => {
                  setContent(e.target.value);
                  scheduleSave({ content: e.target.value });
               }}
               placeholder="Write something…"
               className="w-full min-h-[60vh] resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
            />
         </div>
      </div>
   );
}
