import ProjectActivity from '@/components/common/projects/details/project-activity';

interface ProjectPageProps {
   params: Promise<{ projectId: string }>;
}

/** Coluna da aba; header e sidecar vêm do layout do projeto (pl#6). */
export default async function ProjectPage({ params }: ProjectPageProps) {
   const { projectId } = await params;
   return <ProjectActivity projectId={projectId} />;
}
