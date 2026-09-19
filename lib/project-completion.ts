/**
 * Definição ÚNICA de "projeto concluído" (#41), usada pelo servidor (initiatives,
 * roadmap) e pela UI (lista, detalhe, painéis): status de projeto na categoria
 * `completed` OU 100% das issues concluídas. Cancelado não conta como concluído.
 */
export function isProjectCompleted(project: {
   status: { category: string } | null | undefined;
   percentComplete: number;
}): boolean {
   return project.status?.category === 'completed' || project.percentComplete >= 100;
}
