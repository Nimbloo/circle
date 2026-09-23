import type { User } from '@/data/users';
import { usePreferencesStore } from '@/store/preferences-store';

type Named = Pick<User, 'name'> & Partial<Pick<User, 'slug' | 'email'>>;

/**
 * Nome de uma pessoa conforme a preferência "Display names" (Settings → Preferences):
 * `Full name` (default) mostra o nome; `Username` mostra o handle (o mesmo das @menções:
 * `slug`, ou o prefixo do e-mail), caindo no nome quando não há handle.
 */
export function formatUserName(user: Named, mode: string): string {
   if (mode !== 'Username') return user.name;
   return user.slug || user.email?.split('@')[0] || user.name;
}

/**
 * Lida no render (sem assinar o store): a preferência muda na tela de Settings, e as telas
 * que mostram pessoas re-renderizam ao voltar para elas.
 */
export function userDisplayName(user: Named): string {
   return formatUserName(user, usePreferencesStore.getState().nameDisplay);
}
