import ProjectOverview from '@/components/common/projects/details/project-overview';

interface ProjectPageProps {
   params: Promise<{ projectId: string }>;
}

/** Coluna da aba; header e sidecar vêm do layout do projeto (pl#6). */
export default async function ProjectPage({ params }: ProjectPageProps) {
   const { projectId } = await params;
   return <ProjectOverview projectId={projectId} />;
}
