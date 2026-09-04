import { db } from '@/db';
import { handle, requireEmail, multi } from '@/lib/api/http';
import { listIssues } from '@/lib/api/issues';
import { exportIssuesJson } from '@/lib/api/export';
import { scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Escapa um campo CSV (aspas + quebra de linha). */
function csvCell(v: string | number | null | undefined): string {
   const s = v == null ? '' : String(v);
   return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET /issues/export — exporta as issues (respeitando os filtros de query) como CSV
 * (default) ou JSON estruturado (`?format=json`, com labels/responsáveis/pai/comentários).
 * Portabilidade/backup (paridade Linear export). Retorna o arquivo como attachment.
 */
export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const sp = new URL(req.url).searchParams;
      // Sem isto o export devolvia o WORKSPACE INTEIRO (o filtro vinha só da query).
      const { teamIds } = await scopeForEmail(db, email);
      const filters = {
         teamIds: teamIds ?? undefined,
         team: sp.get('team') ?? undefined,
         status: multi(sp, 'status'),
         priority: multi(sp, 'priority'),
         project: multi(sp, 'project'),
         labels: multi(sp, 'labels'),
         q: sp.get('q') ?? undefined,
         limit: 5000,
      };
      if (sp.get('format') === 'json') {
         const bundle = await exportIssuesJson(db, filters);
         return new Response(JSON.stringify(bundle, null, 2), {
            headers: {
               'Content-Type': 'application/json; charset=utf-8',
               'Content-Disposition': 'attachment; filename="issues.json"',
            },
         });
      }
      const issues = await listIssues(db, filters);
      const header = [
         'identifier',
         'title',
         'status',
         'priority',
         'assignee',
         'assignees',
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
               i.assignees.map((a) => a.name).join('; '),
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
   }, req);
}
