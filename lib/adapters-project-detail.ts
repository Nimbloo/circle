/**
 * Adapter API -> ProjectDetail (tipo rico do detalhe de projeto).
 *
 * O backend expõe a META do projeto (`ProjectDto`: status/priority/health/lead/
 * datas/labels/% — consumida via `useWorkspaceStore().getProjectById`), mas NÃO
 * guarda o conteúdo EDITORIAL que a tela de detalhe mostra: `summary`,
 * `description` (blocos), `resources`, `milestones`, a timeline de `updates`
 * textuais e o `activity` feed. Não há tabela/endpoint para esses campos.
 *
 * Não fabricamos esses dados (os mocks foram zerados de propósito): os campos
 * sem fonte no backend saem VAZIOS e a UI já degrada bem — mostra "Add
 * milestones…", "No updates yet", o CTA "Write first project update" e uma
 * descrição vazia. Quando o backend passar a materializar algum desses campos,
 * este adapter é o único ponto a estender (o resto da tela já lê `ProjectDetail`).
 *
 * `updates`: a composição runtime ("Post update") vive no `useProjectUpdatesStore`
 * e é mesclada no componente da aba Activity — por isso o adapter deixa `updates`
 * vazio (evita duplicar o merge).
 */
import type { ProjectDto } from '@/lib/api/projects';
import type { ProjectDetail } from '@/mock-data/project-details';

/** ProjectDetail "casca" — só o id, com o conteúdo editorial vazio (sem fonte no backend). */
export function emptyProjectDetail(projectId: string): ProjectDetail {
   return {
      projectId,
      summary: '',
      description: [],
      resources: [],
      milestones: [],
      updates: [],
      activity: [],
   };
}

/**
 * ProjectDto (backend) -> ProjectDetail. Hoje o DTO só carrega a meta do
 * projeto; o conteúdo editorial (summary/description/…) não tem fonte, então
 * delegamos para `emptyProjectDetail`. É o seam para quando o backend crescer.
 */
export function adaptProjectDetail(dto: ProjectDto): ProjectDetail {
   return emptyProjectDetail(dto.id);
}
