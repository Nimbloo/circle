import MainLayout from '@/components/layout/main-layout';
import PulseSettings from '@/components/common/settings/pulse-settings';
import Header from '@/components/layout/headers/settings/header';

export default function PulseSettingsPage() {
   return (
      <MainLayout header={<Header />}>
         <PulseSettings />
      </MainLayout>
   );
}
