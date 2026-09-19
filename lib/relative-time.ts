'use client';

import { useEffect, useState } from 'react';

/**
 * Tempo relativo compacto ("now", "5m", "2h", "3d", "1w") a partir de um ISO. Único para
 * as telas de comunicação (inbox, reviews): antes cada uma tinha a sua cópia e o valor
 * era congelado na hidratação ("2m" para sempre).
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
   const then = new Date(iso).getTime();
   if (Number.isNaN(then)) return '';
   const min = Math.floor(Math.max(0, now - then) / 60000);
   if (min < 1) return 'now';
   if (min < 60) return `${min}m`;
   const hours = Math.floor(min / 60);
   if (hours < 24) return `${hours}h`;
   const days = Math.floor(hours / 24);
   if (days < 7) return `${days}d`;
   return `${Math.floor(days / 7)}w`;
}

const TICK_MS = 60_000;
const listeners = new Set<(now: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * "Agora" que avança a cada minuto — um único intervalo para a página inteira, ligado
 * só enquanto há quem escute. Quem usa re-renderiza uma vez por minuto.
 */
export function useNow(): number {
   const [now, setNow] = useState(() => Date.now());
   useEffect(() => {
      listeners.add(setNow);
      if (!timer) {
         timer = setInterval(() => {
            const t = Date.now();
            for (const fn of listeners) fn(t);
         }, TICK_MS);
      }
      return () => {
         listeners.delete(setNow);
         if (listeners.size === 0 && timer) {
            clearInterval(timer);
            timer = null;
         }
      };
   }, []);
   return now;
}
