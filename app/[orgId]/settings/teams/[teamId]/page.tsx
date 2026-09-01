import MainLayout from '@/components/layout/main-layout';
import TeamSettings from '@/components/common/settings/team-settings';

export default async function Page({ params }: { params: Promise<{ teamId: string }> }) {
   const { teamId } = await params;
   return (
      <MainLayout>
         <TeamSettings teamId={teamId} />
      </MainLayout>
   );
}
