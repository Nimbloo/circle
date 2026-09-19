import { api } from '@/lib/client';
import type { EditorDoc } from '@/lib/editor-doc';

type CreateInput = Parameters<typeof api.projects.create>[0];
type ProjectDto = Awaited<ReturnType<typeof api.projects.create>>;

export interface NewProjectPlan {
   input: CreateInput;
   /** Conteúdo editorial; `null` quando não há summary nem descrição. */
   detail: { summary: string | null; descriptionDoc: EditorDoc | null } | null;
   milestones: { name: string; targetDate: string | null }[];
}

/** O que já foi gravado de uma criação que falhou no meio (para retomar sem duplicar). */
export interface CreateProgress {
   project: ProjectDto;
   detailSaved: boolean;
   milestonesSaved: number;
}

/**
 * Cria o projeto e grava detalhe e milestones em chamadas dedicadas (#42). Se um passo
 * depois do `create` falhar, COMPENSA apagando o projeto recém-criado — o novo clique
 * não gera um projeto duplicado. Se nem a compensação passar, `progress` guarda o que
 * já foi gravado e a próxima tentativa RETOMA daí em vez de criar outro.
 */
export async function persistNewProject(
   plan: NewProjectPlan,
   progress: { current: CreateProgress | null }
): Promise<ProjectDto> {
   const state =
      progress.current ??
      (progress.current = {
         project: await api.projects.create(plan.input),
         detailSaved: false,
         milestonesSaved: 0,
      });
   try {
      if (!state.detailSaved) {
         if (plan.detail) await api.projects.updateDetail(state.project.id, plan.detail);
         state.detailSaved = true;
      }
      while (state.milestonesSaved < plan.milestones.length) {
         await api.projects.addMilestone(state.project.id, plan.milestones[state.milestonesSaved]);
         state.milestonesSaved += 1;
      }
      progress.current = null;
      return state.project;
   } catch (error) {
      try {
         await api.projects.remove(state.project.id);
         progress.current = null;
      } catch {
         // Sem compensação: fica o progresso para a próxima tentativa retomar.
      }
      throw error;
   }
}
