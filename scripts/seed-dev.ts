/* Seed de DEV (banco local isolado) — cria um usuário logável + time + issues + cycles,
   pra a review de design ter conteúdo. NÃO usar em prod. */
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { appUser, team as teamT, teamMember } from '@/db/schema';
import { getOrCreateUser } from '@/lib/api/users';
import { createIssue } from '@/lib/api/issues';
import { updateCycleSettings } from '@/lib/api/cycles';

const ME = 'danilosimei@gmail.com';

const TITLES = [
   'Migrar autenticação para NextAuth v5',
   'Corrigir N+1 no bootstrap do workspace',
   'Dark mode: hierarquia de elevação',
   'Cycles automáticos estilo Linear',
   'Sidebar com seções colapsáveis',
   'Toolbar de issues 1:1 com o Linear',
   'Subscriptions: seguir issue + notificação',
   'Rollover de issues abertas no fim do ciclo',
   'Capacity dial por velocidade',
   'Filtro por status/assignee/label',
   'Painel de insights do ciclo',
   'Hover-peek da sidebar colapsada',
   'Snapshot histórico do ciclo fechado',
   'Bulk actions em lote (1 request)',
];

async function main() {
   const me = await getOrCreateUser(db, ME);
   await db
      .update(appUser)
      .set({ passwordHash: await bcrypt.hash('circle123', 10), role: 'Admin', name: 'Danilo Simei' })
      .where(eq(appUser.id, me.id));

   await db
      .insert(teamT)
      .values({ id: 'ENG', name: 'Engenharia de Software', icon: '🛠️', color: '#6771c5', issueSeq: 0 })
      .onConflictDoNothing();
   await db
      .insert(teamMember)
      .values({ teamId: 'ENG', userId: me.id, joined: true })
      .onConflictDoNothing();

   const statuses = ['to-do', 'in-progress', 'done', 'backlog', 'in-progress', 'to-do'];
   const prios = ['urgent', 'high', 'medium', 'low', 'no-priority'];
   for (let i = 0; i < TITLES.length; i++) {
      await createIssue(
         db,
         {
            teamId: 'ENG',
            title: TITLES[i],
            statusId: statuses[i % statuses.length],
            priorityId: prios[i % prios.length],
            assigneeId: i % 3 === 0 ? me.id : null,
         },
         ME
      );
   }

   // Habilita cycles → auto-gera o schedule (current + upcoming) com chart inline.
   await updateCycleSettings(db, 'ENG', {
      enabled: true,
      durationWeeks: 1,
      startDay: 1,
      upcomingCount: 2,
   });

   console.log('[seed-dev] OK: user=%s (senha circle123), team=ENG, issues=%d, cycles=on', ME, TITLES.length);
   process.exit(0);
}

main().catch((e) => {
   console.error('[seed-dev] ERR', e);
   process.exit(1);
});
