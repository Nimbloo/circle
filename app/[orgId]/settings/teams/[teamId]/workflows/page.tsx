import MainLayout from '@/components/layout/main-layout';
import TeamWorkflowsSettings from '@/components/common/settings/team-workflows-settings';

export default async function Page({ params }: { params: Promise<{ teamId: string }> }) {
   const { teamId } = await params;
   return (
      <MainLayout>
         <TeamWorkflowsSettings teamId={teamId} />
      </MainLayout>
   );
}
