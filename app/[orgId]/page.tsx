import { redirect } from 'next/navigation';
import { db } from '@/db';
import { emailFromRequest } from '@/lib/api/auth';
import { orgLandingPath } from '@/lib/api/teams';

export const dynamic = 'force-dynamic';

/**
 * Landing da org: redireciona pra visão default do time — DINÂMICO (não hardcode CORE,
 * que quebrava ao apagar os times mock). Regra em `orgLandingPath`.
 */
export default async function OrgIdPage({ params }: { params: Promise<{ orgId: string }> }) {
   const { orgId } = await params;
   redirect(`/${orgId}/${await orgLandingPath(db, await emailFromRequest())}`);
}
