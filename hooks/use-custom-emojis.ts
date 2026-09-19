'use client';

import { api } from '@/lib/client';
import type { EmojiDto } from '@/lib/api/emojis';
import { useEffect, useState } from 'react';

// Cache module-level: os custom emojis mudam raramente. Evento `catalog` kind `emoji`
// invalida (#53) e os hooks montados recarregam; falha NÃO é cacheada.
let cache: EmojiDto[] | null = null;
let inflight: Promise<EmojiDto[]> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function fetchOnce(): Promise<EmojiDto[]> {
   const gen = generation;
   inflight ??= api.emojis
      .list()
      .then((e) => {
         // Resposta de antes de uma invalidação não sobrescreve a lista nova.
         if (gen === generation) cache = e;
         return e;
      })
      .catch(() => [] as EmojiDto[])
      .finally(() => {
         if (gen === generation) inflight = null;
      });
   return inflight;
}

/** Descarta o cache e faz os hooks montados buscarem de novo (evento de emoji). */
export function invalidateCustomEmojis(): void {
   generation += 1;
   cache = null;
   inflight = null;
   listeners.forEach((l) => l());
}

/** Lista os custom emojis do workspace (cacheada). */
export function useCustomEmojis(): EmojiDto[] {
   const [emojis, setEmojis] = useState<EmojiDto[]>(cache ?? []);
   const [version, setVersion] = useState(0);
   useEffect(() => {
      const bump = () => setVersion((v) => v + 1);
      listeners.add(bump);
      return () => {
         listeners.delete(bump);
      };
   }, []);
   useEffect(() => {
      if (cache) {
         setEmojis(cache);
         return;
      }
      let alive = true;
      void fetchOnce().then((e) => alive && setEmojis(e));
      return () => {
         alive = false;
      };
   }, [version]);
   return emojis;
}

/** Se `emoji` for um shortcode ":code:", devolve a URL da imagem; senão null. */
export function customEmojiUrl(emoji: string): string | null {
   const m = /^:([a-z0-9_]+):$/.exec(emoji);
   if (!m || !cache) return null;
   return cache.find((e) => e.shortcode === m[1])?.url ?? null;
}
