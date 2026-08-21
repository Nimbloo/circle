/**
 * Adapter API -> ProjectDetail (tipo rico do detalhe de projeto).
 *
 * O backend agora materializa o conteúdo EDITORIAL do projeto nas tabelas
 * `project_detail`/`project_milestone`/`project_update`/`project_resource`/
 * `project_activity`, servido em `GET /projects/{id}/detail` (`ProjectDetailDto`).
 * Este adapter converte esse DTO para o `ProjectDetail` que a tela consome.
 *
 * `emptyProjectDetail` continua sendo a casca usada como estado inicial/loading
 * (e fallback em erro de fetch): id + conteúdo vazio, e a UI já degrada bem
 * ("Add milestones…", "No updates yet", descrição vazia).
 */
import type {
   ProjectDetailDto,
   ProjectUpdateDto,
   ProjectActivityDto,
} from '@/lib/api/project-detail';
import type { UserRef } from '@/lib/api/issues';
import type { ProjectDetail } from '@/mock-data/project-details';
import type { User } from '@/mock-data/users';

/** ProjectDetail "casca" — só o id, com o conteúdo editorial vazio (estado de loading/erro). */
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

/** UserRef (backend) -> User (mock-data), preenchendo os campos que a UI não usa. */
function toUser(ref: UserRef | null): User {
   if (!ref) {
      return {
         id: 'unknown',
         name: 'Unknown',
         avatarUrl: '',
         email: '',
         status: 'offline',
         role: 'Member',
         joinedDate: '',
         teamIds: [],
         timezone: 'UTC',
      };
   }
   return {
      id: ref.id,
      name: ref.name,
      avatarUrl: ref.avatarUrl ?? '',
      email: ref.email,
      slug: ref.slug,
      status: 'offline',
      role: 'Member',
      joinedDate: '',
      teamIds: [],
      timezone: 'UTC',
   };
}

/** ISO/date -> 'YYYY-MM-DD' (as datas da UI usam parseISO num dia). */
const day = (iso: string): string => (iso ? iso.slice(0, 10) : '');

function adaptUpdate(u: ProjectUpdateDto): ProjectDetail['updates'][number] {
   return {
      id: u.id,
      author: toUser(u.author),
      date: day(u.createdAt),
      health: u.health,
      blocks: u.blocks,
   };
}

function adaptActivity(a: ProjectActivityDto): ProjectDetail['activity'][number] {
   return { id: a.id, user: toUser(a.user), date: day(a.createdAt), text: a.text };
}

/** ProjectDetailDto (backend) -> ProjectDetail (tela). */
export function adaptProjectDetail(dto: ProjectDetailDto): ProjectDetail {
   return {
      projectId: dto.projectId,
      summary: dto.summary,
      description: dto.description,
      resources: dto.resources.map((r) => ({ label: r.label, url: r.url })),
      milestones: dto.milestones.map((m) => ({
         id: m.id,
         name: m.name,
         targetDate: m.targetDate ?? undefined,
         completed: m.completed,
      })),
      updates: dto.updates.map(adaptUpdate),
      activity: dto.activity.map(adaptActivity),
   };
}
