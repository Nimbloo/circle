import { db } from '@/db';
import { handle, requireEmail, multi } from '@/lib/api/http';
import { exportDescriptions, exportIssueRows, exportIssuesJson } from '@/lib/api/export';
import { scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Escapa um campo CSV (aspas + quebra de linha). Texto que começa com `= + - @` (ou tab/CR)
 * ganha um `'` na frente: sem isso o Excel/Sheets executa o título de uma issue como
 * fórmula (injeção de CSV, OWASP). Números ficam intactos.
 */
function csvCell(v: string | number | null | undefined): string {
   let s = v == null ? '' : String(v);
   if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
   return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
      };
      if (sp.get('format') === 'json') {
         const bundle = await exportIssuesJson(db, filters);
         return new Response(JSON.stringify(bundle, null, 2), {
            headers: {
               'Content-Type': 'application/json; charset=utf-8',
               'Content-Disposition': 'attachment; filename="issues.json"',
               'X-Export-Truncated': String(bundle.truncated),
            },
         });
      }
      const { issues, truncated } = await exportIssueRows(db, filters);
      const descById = await exportDescriptions(
         db,
         issues.map((i) => i.id)
      );
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
         // Aditivas no fim (a posição das antigas não muda): sem elas o CSV perdia a
         // descrição e a hierarquia, e não voltava inteiro pelo import (aliases batem).
         'description',
         'parent',
         'team',
         'updatedAt',
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
               descById.get(i.id) ?? '',
               i.parentIdentifier ?? '',
               i.teamId,
               i.updatedAt,
            ]
               .map(csvCell)
               .join(',')
         );
      }
      // BOM: sem ele o Excel lê o UTF-8 como Windows-1252 e quebra todo acento.
      const csv = '\uFEFF' + lines.join('\n');
      return new Response(csv, {
         headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="issues.csv"',
            // CSV não tem onde dizer "incompleto" no corpo sem quebrar o formato: header.
            'X-Export-Truncated': String(truncated),
         },
      });
   }, req);
}
