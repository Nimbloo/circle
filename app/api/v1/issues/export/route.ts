import { db } from '@/db';
import { handle, requireEmail, multi } from '@/lib/api/http';
import { listIssues } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Escapa um campo CSV (aspas + quebra de linha). */
function csvCell(v: string | number | null | undefined): string {
   const s = v == null ? '' : String(v);
   return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET /issues/export — exporta as issues (respeitando os filtros de query) como CSV.
 * Portabilidade/backup (paridade Linear export). Retorna text/csv com attachment.
 */
export async function GET(req: Request) {
   return handle(async () => {
      await requireEmail(req);
      const sp = new URL(req.url).searchParams;
      const issues = await listIssues(db, {
         team: sp.get('team') ?? undefined,
         status: multi(sp, 'status'),
         priority: multi(sp, 'priority'),
         project: multi(sp, 'project'),
         labels: multi(sp, 'labels'),
         q: sp.get('q') ?? undefined,
         limit: 5000,
      });
      const header = [
         'identifier',
         'title',
         'status',
         'priority',
         'assignee',
         'project',
         'estimate',
         'dueDate',
         'labels',
         'createdAt',
      ];
      const lines = [header.join(',')];
      for (const i of issues) {
         lines.push(
            [
               i.identifier,
               i.title,
               i.status.name,
               i.priority.name,
               i.assignee?.name ?? '',
               i.project?.name ?? '',
               i.estimate ?? '',
               i.dueDate ?? '',
               i.labels.map((l) => l.name).join('; '),
               i.createdAt,
            ]
               .map(csvCell)
               .join(',')
         );
      }
      const csv = lines.join('\n');
      return new Response(csv, {
         headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="issues.csv"',
         },
      });
   });
}
