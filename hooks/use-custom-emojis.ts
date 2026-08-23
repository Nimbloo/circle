'use client';

import { api } from '@/lib/client';
import type { EmojiDto } from '@/lib/api/emojis';
import { useEffect, useState } from 'react';

// Cache module-level: os custom emojis mudam raramente; busca uma vez por sessão.
let cache: EmojiDto[] | null = null;
let inflight: Promise<EmojiDto[]> | null = null;

function fetchOnce(): Promise<EmojiDto[]> {
   inflight ??= api.emojis
      .list()
      .then((e) => {
         cache = e;
         return e;
      })
      .catch(() => {
         cache = [];
         return [];
      });
   return inflight;
}

/** Lista os custom emojis do workspace (cacheada). */
export function useCustomEmojis(): EmojiDto[] {
   const [emojis, setEmojis] = useState<EmojiDto[]>(cache ?? []);
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
   }, []);
   return emojis;
}

/** Se `emoji` for um shortcode ":code:", devolve a URL da imagem; senão null. */
export function customEmojiUrl(emoji: string): string | null {
   const m = /^:([a-z0-9_]+):$/.exec(emoji);
   if (!m || !cache) return null;
   return cache.find((e) => e.shortcode === m[1])?.url ?? null;
}
