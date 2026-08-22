import { redirect } from 'next/navigation';
import { db } from '@/db';
import { emailFromRequest } from '@/lib/api/auth';
import { getOrCreateUser } from '@/lib/api/users';
import { listTeams } from '@/lib/api/teams';

export const dynamic = 'force-dynamic';

/**
 * Landing da org: redireciona pra visão default do time — DINÂMICO (não hardcode CORE,
 * que quebrava ao apagar os times mock). Preferência: 1º time do qual o usuário é
 * membro → 1º time existente → página de criar time (workspace sem times).
 */
export default async function OrgIdPage({ params }: { params: Promise<{ orgId: string }> }) {
   const { orgId } = await params;
   let target = 'settings/teams/new';
   const email = await emailFromRequest();
   if (email) {
      const me = await getOrCreateUser(db, email);
      const joined = await listTeams(db, { membership: ['Joined'] }, me.id);
      if (joined.length > 0) {
         target = `team/${joined[0].id}/all`;
      } else {
         const all = await listTeams(db, {}, me.id);
         if (all.length > 0) target = `team/${all[0].id}/all`;
      }
   }
   redirect(`/${orgId}/${target}`);
}
