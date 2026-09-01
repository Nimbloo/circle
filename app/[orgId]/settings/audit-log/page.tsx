import MainLayout from '@/components/layout/main-layout';
import AuditLogSettings from '@/components/common/settings/audit-log-settings';
import Header from '@/components/layout/headers/settings/header';

export default function Page() {
   return (
      <MainLayout header={<Header />}>
         <AuditLogSettings />
      </MainLayout>
   );
}
