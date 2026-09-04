import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { assertTeamInScope, scopeForEmail } from '@/lib/api/scope';
import { listTeamDocuments, createDocument, createFolder } from '@/lib/api/documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { teamKey } = await params;
      // Convidado (#100) só lê documento de time do escopo dele. A ESCRITA já exigia ser
      // membro (`assertTeamMember`); a leitura ficou sem gate no hardening.
      assertTeamInScope((await scopeForEmail(db, email)).teamIds, teamKey);
      return ok(await listTeamDocuments(db, teamKey));
   }, req);
}

const CreateSchema = z.discriminatedUnion('kind', [
   z.object({
      kind: z.literal('folder'),
      name: z.string().min(1),
      icon: z.string().nullish(),
      id: z.string().optional(),
   }),
   z.object({
      kind: z.literal('document'),
      folderId: z.string().min(1),
      name: z.string().min(1),
      icon: z.string().nullish(),
      pinned: z.boolean().optional(),
   }),
]);

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const email = await requireEmail(req);
      const input = CreateSchema.parse(await req.json());
      if (input.kind === 'folder') {
         return ok(
            await createFolder(
               db,
               {
                  id: input.id,
                  teamId: teamKey,
                  name: input.name,
                  icon: input.icon ?? null,
               },
               email
            )
         );
      }
      return ok(
         await createDocument(
            db,
            {
               folderId: input.folderId,
               teamId: teamKey,
               name: input.name,
               icon: input.icon ?? null,
               pinned: input.pinned,
            },
            email
         )
      );
   }, req);
}
