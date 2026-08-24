import MainLayout from '@/components/layout/main-layout';
import CycleSettings from '@/components/common/settings/cycle-settings';
import Header from '@/components/layout/headers/settings/header';

export default async function Page({ params }: { params: Promise<{ teamId: string }> }) {
   const { teamId } = await params;
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <CycleSettings teamId={teamId} />
      </MainLayout>
   );
}
