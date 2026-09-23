import { usePreferencesStore } from '@/store/preferences-store';

interface KeyLike {
   key: string;
   metaKey: boolean;
   ctrlKey: boolean;
   shiftKey: boolean;
   nativeEvent?: { isComposing?: boolean };
}

/**
 * Preferência "Send comments on..." (Settings → Preferences), lida no momento da tecla.
 * `⌘+Enter` (default): Ctrl/⌘+Enter envia e Enter quebra linha. `Enter`: Enter envia e
 * Shift+Enter quebra linha (Ctrl/⌘+Enter continua enviando). Composição de IME nunca envia.
 */
export function isCommentSubmitKey(event: KeyLike): boolean {
   if (event.key !== 'Enter' || event.nativeEvent?.isComposing) return false;
   if (event.metaKey || event.ctrlKey) return true;
   return usePreferencesStore.getState().sendCommentsOn === 'Enter' && !event.shiftKey;
}
