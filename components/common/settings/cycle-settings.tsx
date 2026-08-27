'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/client';
import type { CycleSettingsDto, UpdateCycleSettingsInput } from '@/lib/api/cycles';
import { SelectMenu, SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DURATIONS = Array.from({ length: 8 }, (_, i) => `${i + 1} ${i === 0 ? 'week' : 'weeks'}`);
const COOLDOWNS = ['No cooldown', '1 week', '2 weeks', '3 weeks', '4 weeks'];
const UPCOMING = Array.from({ length: 15 }, (_, i) => `${i + 1} ${i === 0 ? 'cycle' : 'cycles'}`);

/**
 * "Cycles" nas configurações do time — 1:1 com o Linear. Habilita o schedule automático
 * (duração, cooldown, dia de início, nº de ciclos futuros) + automação (auto-add).
 */
export default function CycleSettings({ teamId }: { teamId: string }) {
   const [s, setS] = useState<CycleSettingsDto | null>(null);

   useEffect(() => {
      let active = true;
      api.cycles
         .settings(teamId)
         .then((dto) => active && setS(dto))
         .catch(() => active && setS(null));
      return () => {
         active = false;
      };
   }, [teamId]);

   const update = async (patch: UpdateCycleSettingsInput) => {
      const prev = s;
      setS((c) => (c ? { ...c, ...patch } : c)); // otimista
      try {
         setS(await api.cycles.updateSettings(teamId, patch));
      } catch {
         setS(prev);
         toast.error('Falha ao salvar as configurações de cycle');
      }
   };

   if (!s) {
      return (
         <SettingsShell title="Cycles">
            <p className="text-sm text-muted-foreground px-1">Carregando…</p>
         </SettingsShell>
      );
   }

   return (
      <SettingsShell
         title="Cycles"
         description="Cycles create rhythm and focus with short, time-boxed planning windows. Automations can create future cycles, carry over unfinished work, and move issues in or out based on status."
      >
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="Enable cycles"
                  description="Automatically create a repeating schedule of time-boxed planning windows for the team"
                  trailing={
                     <Switch
                        checked={s.enabled}
                        onCheckedChange={(v) => void update({ enabled: v })}
                     />
                  }
               />
               {s.enabled && (
                  <>
                     <SettingsRow
                        title="Cycle duration"
                        trailing={
                           <SelectMenu
                              options={DURATIONS}
                              value={DURATIONS[s.durationWeeks - 1]}
                              onChange={(v) => void update({ durationWeeks: DURATIONS.indexOf(v) + 1 })}
                           />
                        }
                     />
                     <SettingsRow
                        title="Cooldown duration"
                        description="Optional break after each cycle for planning and tech debt"
                        trailing={
                           <SelectMenu
                              options={COOLDOWNS}
                              value={COOLDOWNS[s.cooldownWeeks]}
                              onChange={(v) => void update({ cooldownWeeks: COOLDOWNS.indexOf(v) })}
                           />
                        }
                     />
                     <SettingsRow
                        title="Cycle start"
                        description="The day of the week each cycle begins"
                        trailing={
                           <SelectMenu
                              options={DAYS}
                              value={DAYS[s.startDay]}
                              onChange={(v) => void update({ startDay: DAYS.indexOf(v) })}
                           />
                        }
                     />
                     <SettingsRow
                        title="Auto-create cycles"
                        description="How many upcoming cycles to keep pre-created for planning"
                        trailing={
                           <SelectMenu
                              options={UPCOMING}
                              value={UPCOMING[s.upcomingCount - 1]}
                              onChange={(v) => void update({ upcomingCount: UPCOMING.indexOf(v) + 1 })}
                           />
                        }
                     />
                  </>
               )}
            </SettingsCard>
         </SettingsSection>

         {s.enabled && (
            <SettingsSection
               title="Cycle automation"
               description="Capture all work in cycles by auto-adding issues to cycles based on their status type"
            >
               <SettingsCard>
                  <SettingsRow
                     title="Active issues"
                     description="Auto-add started and unstarted issues to the current cycle, or the next if in cooldown"
                     trailing={
                        <Switch
                           checked={s.autoAdd}
                           onCheckedChange={(v) => void update({ autoAdd: v })}
                        />
                     }
                  />
                  <SettingsRow
                     title="Measure progress by estimate"
                     description="Cycle and project progress count estimate points instead of issue count (issues without an estimate count as 1)"
                     trailing={
                        <Switch
                           checked={s.estimatesEnabled}
                           onCheckedChange={(v) => void update({ estimatesEnabled: v })}
                        />
                     }
                  />
               </SettingsCard>
            </SettingsSection>
         )}
      </SettingsShell>
   );
}
