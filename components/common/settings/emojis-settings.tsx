'use client';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingArea } from '@/components/common/loading-area';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
   useLatchedTarget,
} from '@/components/ui/alert-dialog';
import { api } from '@/lib/client';
import { errorReason } from '@/lib/error-reason';
import { SettingsCard, SettingsRow, SettingsShell } from './shared';
import type { EmojiDto } from '@/lib/api/emojis';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Plus, Smile, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

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
      } catch (err) {
         toast.error(errorReason(err, 'Não foi possível adicionar o emoji'));
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
   // true desde o 1º paint: evita o flash de "Nenhum emoji" antes do load resolver.
   const [loading, setLoading] = useState(true);
   const [dialogOpen, setDialogOpen] = useState(false);
   const [query, setQuery] = useState('');
   // Excluir pede confirmação (ad#13). Alvo e `open` separados: o nome não some do
   // título durante a animação de saída.
   const [removing, setRemoving] = useState<EmojiDto | null>(null);
   const removingLatched = useLatchedTarget(removing);
   const [removeOpen, setRemoveOpen] = useState(false);
   const [removeBusy, setRemoveBusy] = useState(false);

   // Loading só na primeira carga; o reload pós-mutation (add/remove) é silencioso —
   // a lista atual fica na tela até a nova chegar, sem piscar.
   const loadedOnceRef = useRef(false);
   const load = useCallback(async () => {
      if (!loadedOnceRef.current) setLoading(true);
      try {
         setEmojis(await api.emojis.list());
         loadedOnceRef.current = true;
      } catch {
         // Falha de refetch não apaga o que já está na tela; só a 1ª carga zera.
         if (!loadedOnceRef.current) setEmojis([]);
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void load();
   }, [load]);

   const confirmRemove = async () => {
      if (!removing || removeBusy) return;
      setRemoveBusy(true);
      try {
         await api.emojis.remove(removing.id);
         setRemoveOpen(false);
         await load();
         toast.success('Emoji removido');
      } catch (err) {
         toast.error(errorReason(err, 'Não foi possível remover o emoji'));
      } finally {
         setRemoveBusy(false);
      }
   };

   const visibleEmojis = useMemo(() => {
      const needle = query.trim().toLowerCase();
      return needle
         ? emojis.filter((emoji) => emoji.shortcode.toLowerCase().includes(needle))
         : emojis;
   }, [emojis, query]);

   return (
      <SettingsShell
         title="Emojis"
         action={
            isAdmin ? (
               <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1">
                  <Plus className="size-4" />
                  Adicionar emoji
               </Button>
            ) : undefined
         }
      >
         <div className="flex flex-col gap-4">
            <Input
               placeholder="Filter by name..."
               value={query}
               onChange={(event) => setQuery(event.target.value)}
               className="h-8 w-[300px] max-w-full"
            />

            {loading ? (
               <LoadingArea rows={4} />
            ) : visibleEmojis.length === 0 ? (
               query ? (
                  <EmptyState variant="search" title="Nenhum emoji encontrado" className="py-10" />
               ) : (
                  <EmptyState icon={Smile} title="Nenhum emoji customizado" className="py-10" />
               )
            ) : (
               <SettingsCard>
                  {visibleEmojis.map((e) => (
                     <SettingsRow
                        key={e.id}
                        icon={
                           // eslint-disable-next-line @next/next/no-img-element
                           <img src={e.url} alt={e.shortcode} className="size-5 object-contain" />
                        }
                        title={`:${e.shortcode}:`}
                        trailing={
                           isAdmin ? (
                              <Button
                                 size="icon"
                                 variant="ghost"
                                 className="size-7 text-muted-foreground hover:text-destructive"
                                 aria-label={`Remover :${e.shortcode}:`}
                                 onClick={() => {
                                    setRemoving(e);
                                    setRemoveOpen(true);
                                 }}
                              >
                                 <Trash2 className="size-3.5" />
                              </Button>
                           ) : undefined
                        }
                     />
                  ))}
               </SettingsCard>
            )}
         </div>

         <UploadDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={load} />

         <AlertDialog open={removeOpen} onOpenChange={(o) => !removeBusy && setRemoveOpen(o)}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Remover :{removingLatched?.shortcode}:?</AlertDialogTitle>
                  <AlertDialogDescription>
                     O emoji customizado é excluído do workspace. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={removeBusy}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={(ev) => {
                        ev.preventDefault();
                        void confirmRemove();
                     }}
                     disabled={removeBusy}
                     className="bg-destructive text-white hover:bg-destructive/90"
                  >
                     {removeBusy ? 'Removendo…' : 'Remover'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </SettingsShell>
   );
}
