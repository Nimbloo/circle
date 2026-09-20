import { ProjectDetailProvider } from '@/components/common/projects/details/use-project-detail';
import { ProjectShell } from '@/components/common/projects/details/project-shell';
import Header from '@/components/layout/headers/project/header';
import MainLayout from '@/components/layout/main-layout';

/**
 * Layout do projeto (#45, R5, pl#6): o detalhe editorial, as dependências e os
 * snapshots são carregados UMA vez e compartilhados pelas abas Overview/Issues/Activity.
 * O header e o sidecar também vivem aqui — trocar de aba só troca a coluna da aba.
 */
export default async function ProjectLayout({
   children,
   params,
}: {
   children: React.ReactNode;
   params: Promise<{ projectId: string }>;
}) {
   const { projectId } = await params;
   return (
      <ProjectDetailProvider projectId={projectId}>
         <MainLayout header={<Header projectId={projectId} />}>
            <ProjectShell projectId={projectId}>{children}</ProjectShell>
         </MainLayout>
      </ProjectDetailProvider>
   );
}
