'use client';

import { useRelativeTime } from '@/lib/relative-time';

/** Tempo relativo que avança a cada minuto; sem ISO mostra o `fallback` já calculado. */
export function TimeAgo({ iso, fallback = '' }: { iso?: string | null; fallback?: string }) {
   return <>{useRelativeTime(iso, fallback)}</>;
}
