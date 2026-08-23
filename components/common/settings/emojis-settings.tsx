'use client';

import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/client';
import type { EmojiDto } from '@/lib/api/emojis';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Plus, Smile, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SettingsShell } from './shared';

/** Lê um File como { dataUrl, contentType }. */
function readFile(file: File): Promise<{ dataUrl: string; contentType: string }> {
   return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: String(reader.result), contentType: file.type });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
   });
}

function UploadDialog({
   open,
   onOpenChange,
   onSaved,
}: {
   open: boolean;
   onOpenChange: (v: boolean) => void;
   onSaved: () => void;
}) {
   const [busy, setBusy] = useState(false);
   const [shortcode, setShortcode] = useState('');
   const [file, setFile] = useState<{ dataUrl: string; contentType: string } | null>(null);
   const inputRef = useRef<HTMLInputElement>(null);

   useEffect(() => {
      if (open) {
         setShortcode('');
         setFile(null);
      }
   }, [open]);

   const pick = async (f: File | undefined) => {
      if (!f) return;
      if (f.size > 256 * 1024) {
         toast.error('Imagem excede 256KB');
         return;
      }
      try {
         setFile(await readFile(f));
      } catch {
         toast.error('Não foi possível ler a imagem');
      }
   };

   const save = async () => {
      if (!shortcode.trim() || !file || busy) return;
      setBusy(true);
      try {
         await api.emojis.create({
            shortcode: shortcode.trim(),
            dataUrl: file.dataUrl,
            contentType: file.contentType,
         });
         onOpenChange(false);
         onSaved();
         toast.success('Emoji adicionado');
      } catch {
         toast.error(
            'Não foi possível adicionar o emoji (shortcode duplicado ou imagem inválida?)'
         );
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Adicionar emoji customizado</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="emoji-code">Shortcode</Label>
                  <div className="flex items-center gap-1">
                     <span className="text-muted-foreground">:</span>
                     <Input
                        id="emoji-code"
                        value={shortcode}
                        placeholder="deploy"
                        onChange={(e) => setShortcode(e.target.value)}
                     />
                     <span className="text-muted-foreground">:</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                     Letras, números e _ (ex: :deploy:)
                  </p>
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label>Imagem (PNG, JPEG, WebP ou GIF — máx 256KB)</Label>
                  <input
                     ref={inputRef}
                     type="file"
                     accept="image/png,image/jpeg,image/webp,image/gif"
                     className="hidden"
                     onChange={(e) => void pick(e.target.files?.[0])}
                  />
                  <div className="flex items-center gap-3">
                     <Button
                        variant="outline"
                        size="sm"
                        onClick={() => inputRef.current?.click()}
                        className="gap-1.5"
                     >
                        <Upload className="size-4" />
                        Escolher imagem
                     </Button>
                     {file && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                           src={file.dataUrl}
                           alt="preview"
                           className="size-8 rounded object-contain border"
                        />
                     )}
                  </div>
               </div>
            </div>
            <DialogFooter>
               <Button
                  size="sm"
                  onClick={() => void save()}
                  disabled={busy || !shortcode.trim() || !file}
               >
                  Adicionar
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/** Workspace "Emojis" settings — CRUD de emojis customizados (imagem no S3/CDN). */
export default function EmojisSettings() {
   const me = useWorkspaceStore((s) => s.me);
   const isAdmin = me?.admin ?? false;

   const [emojis, setEmojis] = useState<EmojiDto[]>([]);
   const [loading, setLoading] = useState(false);
   const [dialogOpen, setDialogOpen] = useState(false);

   const load = useCallback(async () => {
      setLoading(true);
      try {
         setEmojis(await api.emojis.list());
      } catch {
         setEmojis([]);
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void load();
   }, [load]);

   const remove = async (e: EmojiDto) => {
      try {
         await api.emojis.remove(e.id);
         await load();
         toast.success('Emoji removido');
      } catch {
         toast.error('Não foi possível remover o emoji');
      }
   };

   return (
      <SettingsShell
         title="Emojis"
         description="Emojis customizados do workspace, usados em reações a comentários. As imagens são servidas via CDN."
      >
         <div className="flex justify-end mb-4">
            {isAdmin && (
               <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1">
                  <Plus className="size-4" />
                  Adicionar emoji
               </Button>
            )}
         </div>

         {loading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
         ) : emojis.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-container px-4 py-10 text-center">
               <Smile className="size-8 text-muted-foreground/40" />
               <p className="text-sm font-medium">Nenhum emoji customizado</p>
               <p className="text-xs text-muted-foreground">
                  {isAdmin
                     ? 'Adicione emojis para o time usar nas reações.'
                     : 'Peça a um administrador para adicionar emojis.'}
               </p>
            </div>
         ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
               {emojis.map((e) => (
                  <div
                     key={e.id}
                     className="group relative flex flex-col items-center gap-2 rounded-lg border bg-container p-4"
                  >
                     {/* eslint-disable-next-line @next/next/no-img-element */}
                     <img src={e.url} alt={e.shortcode} className="size-10 object-contain" />
                     <span className="text-xs text-muted-foreground truncate max-w-full">
                        :{e.shortcode}:
                     </span>
                     {isAdmin && (
                        <Button
                           size="icon"
                           variant="ghost"
                           className="absolute top-1 right-1 size-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                           aria-label="Remover emoji"
                           onClick={() => void remove(e)}
                        >
                           <Trash2 className="size-3.5" />
                        </Button>
                     )}
                  </div>
               ))}
            </div>
         )}

         <UploadDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={load} />
      </SettingsShell>
   );
}
