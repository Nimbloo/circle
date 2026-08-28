'use client';

import { Button } from '@/components/ui/button';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/client';
import { cn } from '@/lib/utils';
import { CheckIcon, FolderPlus, Pin, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

interface FolderRef {
   id: string;
   name: string;
   icon: string;
}

/** Chip clicável — mesma linguagem visual do New project / New issue. */
function Chip({ active, children }: { active?: boolean; children: React.ReactNode }) {
   return (
      <span
         className={cn(
            'inline-flex items-center gap-1.5 h-7 px-2 rounded-md border text-xs transition-colors cursor-pointer hover:bg-accent/50',
            active ? 'text-foreground' : 'text-muted-foreground'
         )}
      >
         {children}
      </span>
   );
}

/**
 * Modal de criação de documento no MESMO padrão do New project (Linear): header com
 * breadcrumb da pasta (escolher existente ou criar nova inline) + fechar, ícone
 * quadrado editável + título grande, chip Pinned e footer. Persiste via
 * createFolder (quando nova) + createDocument.
 */
export function CreateDocumentButton({
   teamId,
   folders,
   onCreated,
}: {
   teamId: string;
   folders: FolderRef[];
   onCreated: () => void | Promise<void>;
}) {
   const [open, setOpen] = useState(false);
   const [busy, setBusy] = useState(false);
   const [name, setName] = useState('');
   const [icon, setIcon] = useState('📄');
   const [folderId, setFolderId] = useState<string | null>(null);
   const [newFolder, setNewFolder] = useState('');
   const [folderSearch, setFolderSearch] = useState('');
   const [pinned, setPinned] = useState(false);

   const selectedFolder = folders.find((f) => f.id === folderId) ?? null;
   const hasFolder = Boolean(selectedFolder || newFolder.trim());

   const filteredFolders = useMemo(() => {
      const q = folderSearch.trim().toLowerCase();
      return q ? folders.filter((f) => f.name.toLowerCase().includes(q)) : folders;
   }, [folders, folderSearch]);
   const exactMatch = folders.some(
      (f) => f.name.toLowerCase() === folderSearch.trim().toLowerCase()
   );

   const reset = () => {
      setName('');
      setIcon('📄');
      setFolderId(folders[0]?.id ?? null);
      setNewFolder('');
      setFolderSearch('');
      setPinned(false);
   };

   const create = async () => {
      if (!name.trim() || !teamId || !hasFolder || busy) return;
      setBusy(true);
      try {
         let targetFolderId = folderId;
         if (!selectedFolder && newFolder.trim()) {
            const folder = await api.teams.createFolder(teamId, {
               name: newFolder.trim(),
               icon: '📁',
            });
            targetFolderId = folder.id;
         }
         if (!targetFolderId) throw new Error('no folder');
         await api.teams.createDocument(teamId, {
            folderId: targetFolderId,
            name: name.trim(),
            icon: icon || null,
            pinned,
         });
         await onCreated();
         setOpen(false);
         toast.success('Documento criado');
         reset();
      } catch {
         toast.error('Não foi possível criar o documento');
      } finally {
         setBusy(false);
      }
   };

   const folderLabel = selectedFolder
      ? `${selectedFolder.icon} ${selectedFolder.name}`
      : newFolder.trim()
        ? `📁 ${newFolder.trim()} (new)`
        : 'Select folder';

   return (
      <Dialog
         open={open}
         onOpenChange={(v) => {
            setOpen(v);
            if (v) reset();
         }}
      >
         <DialogTrigger asChild>
            <Button size="xs" variant="secondary" className="shrink-0 gap-1">
               <Plus className="size-4" />
               New document
            </Button>
         </DialogTrigger>
         <DialogContent showCloseButton={false} className="sm:max-w-lg p-0 gap-0 overflow-hidden">
            <DialogTitle className="sr-only">New document</DialogTitle>

            {/* Header: breadcrumb da pasta + fechar */}
            <div className="flex items-center justify-between px-5 py-3 border-b">
               <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Popover>
                     <PopoverTrigger asChild>
                        <span className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-accent/50 cursor-pointer text-foreground font-medium max-w-56 truncate">
                           {folderLabel}
                        </span>
                     </PopoverTrigger>
                     <PopoverContent align="start" className="w-64 p-0">
                        <Command shouldFilter={false}>
                           <CommandInput
                              placeholder="Folder or new name…"
                              value={folderSearch}
                              onValueChange={setFolderSearch}
                           />
                           <CommandList>
                              <CommandEmpty>Type a name to create a folder.</CommandEmpty>
                              <CommandGroup>
                                 {filteredFolders.map((f) => (
                                    <CommandItem
                                       key={f.id}
                                       onSelect={() => {
                                          setFolderId(f.id);
                                          setNewFolder('');
                                          setFolderSearch('');
                                       }}
                                    >
                                       <span className="text-base leading-none">{f.icon}</span>
                                       {f.name}
                                       {folderId === f.id && (
                                          <CheckIcon className="ml-auto size-3.5" />
                                       )}
                                    </CommandItem>
                                 ))}
                                 {folderSearch.trim() && !exactMatch && (
                                    <CommandItem
                                       onSelect={() => {
                                          setNewFolder(folderSearch.trim());
                                          setFolderId(null);
                                          setFolderSearch('');
                                       }}
                                    >
                                       <FolderPlus className="size-4 text-muted-foreground" />
                                       Create “{folderSearch.trim()}”
                                    </CommandItem>
                                 )}
                              </CommandGroup>
                           </CommandList>
                        </Command>
                     </PopoverContent>
                  </Popover>
                  <span>›</span>
                  <span>New document</span>
               </div>
               <button
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Close"
               >
                  <X className="size-4" />
               </button>
            </div>

            {/* Ícone quadrado editável + título grande */}
            <div className="px-5 py-4 flex flex-col gap-3">
               <div className="flex items-start gap-3">
                  <Popover>
                     <PopoverTrigger asChild>
                        <button className="inline-flex size-9 items-center justify-center rounded-md bg-muted/50 shrink-0 mt-0.5 text-lg hover:bg-muted">
                           {icon || '📄'}
                        </button>
                     </PopoverTrigger>
                     <PopoverContent align="start" className="w-40 p-2">
                        <input
                           value={icon}
                           onChange={(e) => setIcon(e.target.value)}
                           maxLength={2}
                           placeholder="Emoji"
                           className="w-full bg-transparent text-center text-lg outline-none border rounded-md h-9"
                           aria-label="Icon"
                        />
                     </PopoverContent>
                  </Popover>
                  <div className="flex-1 min-w-0">
                     <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Document name"
                        maxLength={196}
                        onKeyDown={(e) => {
                           if (e.key === 'Enter') void create();
                        }}
                        className="w-full bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground"
                     />
                  </div>
               </div>

               {/* Chips de propriedade */}
               <div className="flex items-center gap-1.5 flex-wrap">
                  <button type="button" onClick={() => setPinned((p) => !p)}>
                     <Chip active={pinned}>
                        <Pin className="size-3.5" />
                        {pinned ? 'Pinned' : 'Pin'}
                     </Chip>
                  </button>
               </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
               <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
               </Button>
               <Button
                  size="sm"
                  onClick={() => void create()}
                  disabled={busy || !name.trim() || !hasFolder}
               >
                  Create document
               </Button>
            </div>
         </DialogContent>
      </Dialog>
   );
}
