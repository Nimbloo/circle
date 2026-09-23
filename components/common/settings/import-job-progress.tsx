'use client';

import { api } from '@/lib/client';
import { SettingsCard } from './shared';
import type { ImportJobDto } from '@/lib/api/import';
import { IMPORT_JOB_EVENT, useLiveReload } from '@/lib/use-live-sync';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Acompanha um job de import em background (#10): relê `GET /import/jobs/:id` a cada
 * `intervalMs` e na hora em que o evento SSE do dono chega. Chama `onFinished` UMA vez,
 * com o job concluído (sucesso ou falha). Falha de rede não encerra: tenta de novo.
 */
export function ImportJobProgress({
   jobId,
   onFinished,
   intervalMs = 1000,
}: {
   jobId: string;
   onFinished: (job: ImportJobDto) => void;
   intervalMs?: number;
}) {
   const [job, setJob] = useState<ImportJobDto | null>(null);
   const [offline, setOffline] = useState(false);
   const done = useRef(false);
   const seq = useRef(0);
   const finishedRef = useRef(onFinished);
   useEffect(() => {
      finishedRef.current = onFinished;
   });

   const load = useCallback(async () => {
      if (done.current) return;
      const mine = ++seq.current;
      try {
         const dto = await api.importIssues.job(jobId);
         if (done.current || mine !== seq.current) return;
         setOffline(false);
         setJob(dto);
         if (dto.status === 'succeeded' || dto.status === 'failed') {
            done.current = true;
            finishedRef.current(dto);
         }
      } catch {
         if (mine === seq.current) setOffline(true);
      }
   }, [jobId]);

   useEffect(() => {
      done.current = false;
      void load();
      const timer = setInterval(() => void load(), intervalMs);
      return () => clearInterval(timer);
   }, [load, intervalMs]);

   useLiveReload(IMPORT_JOB_EVENT, { id: jobId }, load);

   const total = job?.total ?? 0;
   const processed = job?.processed ?? 0;
   const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
   return (
      <SettingsCard>
         <div className="flex flex-col gap-2 p-4" aria-live="polite">
            <div className="flex items-center justify-between text-[13px]">
               <span className="font-medium">Importando…</span>
               <span className="text-muted-foreground">
                  {job ? `${processed} de ${total} linha(s)` : 'Preparando…'}
               </span>
            </div>
            <div
               role="progressbar"
               aria-label="Progresso do import"
               aria-valuemin={0}
               aria-valuemax={100}
               aria-valuenow={pct}
               className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20"
            >
               <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            {offline && (
               <p className="text-[12px] text-muted-foreground">
                  Sem conexão com o servidor — tentando de novo. O import continua rodando.
               </p>
            )}
         </div>
      </SettingsCard>
   );
}
