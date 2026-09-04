import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listDependencies, setDependencies } from '@/lib/api/project-dependencies';
import { assertProjectInScope, scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      const { teamIds } = await scopeForEmail(db, email);
      await assertProjectInScope(db, teamIds, id);
      return ok(await listDependencies(db, id));
   }, req);
}

const PutSchema = z.object({
   dependsOn: z.array(z.string().min(1).max(36)).max(50),
});

/** Substitui o conjunto de dependências do projeto. Ciclo → 400. */
export async function PUT(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      const { teamIds } = await scopeForEmail(db, email);
      await assertProjectInScope(db, teamIds, id);
      const { dependsOn } = PutSchema.parse(await req.json());
      return ok(await setDependencies(db, id, dependsOn));
   }, req);
}
