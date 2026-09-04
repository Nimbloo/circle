import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { listViews, createView } from '@/lib/api/views';
import { visibleTeamIds } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      // Escopo por usuário: sem o viewerId, listViews retornava as views PESSOAIS de
      // todos os usuários (vazamento). Passa o meId → só compartilhadas + as do próprio.
      const email = await requireEmail(req);
      const me = await getOrCreateUser(db, email);
      const sp = new URL(req.url).searchParams;
      // Escopo de Guest (#100): views compartilhadas só dos times visíveis.
      const teamIds = await visibleTeamIds(db, me);
      return ok(await listViews(db, sp.get('team') ?? undefined, me.id, teamIds ?? undefined));
   }, req);
}

const FilterSchema = z.object({
   statusCategories: z.array(z.string()).optional(),
   statusIds: z.array(z.string()).optional(),
   labelIds: z.array(z.string()).optional(),
   priorityIds: z.array(z.string()).optional(),
   hasProject: z.boolean().optional(),
   unassigned: z.boolean().optional(),
   // Saved search (#99): termo full-text resolvido por `lib/api/search.ts`.
   q: z.string().max(200).optional(),
});

const CreateSchema = z.object({
   slug: z.string().min(1),
   name: z.string().min(1),
   type: z.enum(['issue', 'project']),
   filter: FilterSchema,
   description: z.string().nullish(),
   icon: z.string().nullish(),
   teamId: z.string().nullish(),
});

export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const input = CreateSchema.parse(await req.json());
      return ok(await createView(db, input, email));
   }, req);
}
