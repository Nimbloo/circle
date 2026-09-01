import MainLayout from '@/components/layout/main-layout';
import EmojisSettings from '@/components/common/settings/emojis-settings';
import Header from '@/components/layout/headers/settings/header';

export default function EmojisSettingsPage() {
   return (
      <MainLayout header={<Header />}>
         <EmojisSettings />
      </MainLayout>
   );
}
