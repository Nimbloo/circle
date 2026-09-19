import { ProjectDetailProvider } from '@/components/common/projects/details/use-project-detail';

/**
 * Layout do projeto (#45, R5): o detalhe editorial é carregado UMA vez e compartilhado
 * pelas abas Overview/Issues/Activity — trocar de aba não refaz o fetch nem perde o
 * estado, e o live reload do projeto vale para todas.
 */
export default async function ProjectLayout({
   children,
   params,
}: {
   children: React.ReactNode;
   params: Promise<{ projectId: string }>;
}) {
   const { projectId } = await params;
   return <ProjectDetailProvider projectId={projectId}>{children}</ProjectDetailProvider>;
}
