import ProjectIssues from '@/components/common/projects/details/project-issues';

interface ProjectPageProps {
   params: Promise<{ projectId: string }>;
}

/** Coluna da aba; header e sidecar vêm do layout do projeto (pl#6). */
export default async function ProjectPage({ params }: ProjectPageProps) {
   const { projectId } = await params;
   return <ProjectIssues projectId={projectId} />;
}
