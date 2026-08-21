import { redirect } from 'next/navigation';

/**
 * Landing da org: redireciona pra visão default do time. Usa o `orgId` real da rota
 * (não hardcode) com path absoluto — `redirect` relativo resolvia errado a partir de
 * `/{orgId}`. Workspace é único (nimbloo), mas o param mantém a rota consistente.
 */
export default async function OrgIdPage({ params }: { params: Promise<{ orgId: string }> }) {
   const { orgId } = await params;
   redirect(`/${orgId}/team/CORE/all`);
}
