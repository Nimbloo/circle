import { db } from '@/db';
import { listPriorities } from '@/lib/api/catalogs';
import { ok } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
   return ok(await listPriorities(db));
}
