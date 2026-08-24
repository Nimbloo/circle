import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { appUser } from '@/db/schema';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { emailFromRequest } from '@/lib/api/auth';
import { getIssueDetail, updateIssueContent } from '@/lib/api/issue-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Resolve o id do usuário atual pelo e-mail do request (sem criar — é read path). */
async function meIdFrom(req: Request): Promise<string | undefined> {
   const email = await emailFromRequest(req);
   if (!email) return undefined;
   const rows = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.email, email.trim().toLowerCase()))
      .limit(1);
   return rows[0]?.id;
}

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const dto = await getIssueDetail(db, id, await meIdFrom(req));
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   });
}

const PatchSchema = z.object({
   description: z.string().max(20000).nullish(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      const { description } = PatchSchema.parse(await req.json());
      const dto = await updateIssueContent(db, id, description ?? null);
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   });
}
