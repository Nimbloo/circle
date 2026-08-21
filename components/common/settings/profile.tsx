'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/client';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Lado do avatar redimensionado (px). Mantém o payload pequeno independente do original. */
const AVATAR_SIZE = 256;
/** Qualidade do encode WebP. */
const AVATAR_QUALITY = 0.85;

/**
 * Redimensiona a imagem escolhida para um quadrado {@link AVATAR_SIZE} via canvas
 * (cover-crop centralizado) e exporta como data-URL. Retorna também o content-type
 * REAL produzido pelo canvas (WebP quando suportado; alguns browsers caem em PNG).
 */
async function resizeToDataUrl(file: File): Promise<{ dataUrl: string; contentType: string }> {
   const bitmap = await createImageBitmap(file);
   try {
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d indisponível');
      const scale = Math.max(AVATAR_SIZE / bitmap.width, AVATAR_SIZE / bitmap.height);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      ctx.drawImage(bitmap, (AVATAR_SIZE - w) / 2, (AVATAR_SIZE - h) / 2, w, h);
      const dataUrl = canvas.toDataURL('image/webp', AVATAR_QUALITY);
      const contentType = dataUrl.slice(5, dataUrl.indexOf(';')); // "data:<mime>;base64,..."
      return { dataUrl, contentType };
   } finally {
      bitmap.close();
   }
}

/** Personal "Profile" settings. */
export default function Profile() {
   const me = useWorkspaceStore((s) => s.me);
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const [name, setName] = useState(me?.name ?? '');
   const [saving, setSaving] = useState(false);
   const [uploading, setUploading] = useState(false);
   const [preview, setPreview] = useState<string | null>(null);
   const fileRef = useRef<HTMLInputElement>(null);

   // Mantém o input em sincronia quando o workspace (re)hidrata.
   useEffect(() => {
      if (me?.name) setName(me.name);
   }, [me?.name]);

   const saveName = async () => {
      const next = name.trim();
      if (!me || saving || !next || next === me.name) return;
      setSaving(true);
      try {
         await api.me.update({ name: next });
         await hydrate();
         toast.success('Name updated');
      } catch {
         toast.error('Could not update your name');
         setName(me.name);
      } finally {
         setSaving(false);
      }
   };

   const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // permite re-selecionar o mesmo arquivo depois
      if (!file || uploading) return;
      setUploading(true);
      try {
         const { dataUrl, contentType } = await resizeToDataUrl(file);
         setPreview(dataUrl); // preview otimista imediato
         await api.me.uploadAvatar(dataUrl, contentType);
         await hydrate(); // re-hidrata → avatar novo no org-switcher/inbox
         toast.success('Profile picture updated');
      } catch {
         setPreview(null);
         toast.error('Could not update your picture');
      } finally {
         setUploading(false);
      }
   };

   const removePhoto = async () => {
      if (uploading) return;
      setUploading(true);
      try {
         await api.me.removeAvatar();
         await hydrate();
         setPreview(null);
         toast.success('Profile picture removed');
      } catch {
         toast.error('Could not remove your picture');
      } finally {
         setUploading(false);
      }
   };

   if (!me) {
      return (
         <SettingsShell title="Profile">
            <SettingsSection>
               <SettingsCard>
                  <SettingsRow title="Loading…" />
               </SettingsCard>
            </SettingsSection>
         </SettingsShell>
      );
   }

   const hasCustomPhoto = !!me.avatarUrl?.includes('/api/v1/users/');
   const avatarSrc = preview ?? me.avatarUrl ?? undefined;

   return (
      <SettingsShell title="Profile">
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="Profile picture"
                  description="PNG, JPEG or WebP. Resized to a square."
                  trailing={
                     <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                           <AvatarImage src={avatarSrc || undefined} alt={me.name} />
                           <AvatarFallback>{me.name[0]}</AvatarFallback>
                        </Avatar>
                        <input
                           ref={fileRef}
                           type="file"
                           accept="image/png,image/jpeg,image/webp"
                           className="hidden"
                           onChange={(e) => void onPickFile(e)}
                        />
                        <Button
                           variant="outline"
                           size="sm"
                           disabled={uploading}
                           onClick={() => fileRef.current?.click()}
                        >
                           {uploading ? 'Uploading…' : 'Change'}
                        </Button>
                        {hasCustomPhoto && (
                           <Button
                              variant="ghost"
                              size="sm"
                              disabled={uploading}
                              onClick={() => void removePhoto()}
                           >
                              Remove
                           </Button>
                        )}
                     </div>
                  }
               />
               <SettingsRow
                  title="Email"
                  trailing={<span className="text-foreground">{me.email}</span>}
               />
               <SettingsRow
                  title="Full name"
                  trailing={
                     <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => void saveName()}
                        onKeyDown={(e) => {
                           if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                        disabled={saving}
                        className="h-8 w-44"
                     />
                  }
               />
               <SettingsRow
                  title="Username"
                  description="One word, like a nickname or first name"
                  trailing={<Input defaultValue={me.slug} disabled className="h-8 w-44" />}
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
