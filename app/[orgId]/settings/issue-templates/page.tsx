import MainLayout from '@/components/layout/main-layout';
import IssueTemplatesSettings from '@/components/common/settings/issue-templates-settings';
import Header from '@/components/layout/headers/settings/header';

export default function Page() {
   return (
      <MainLayout header={<Header />}>
         <IssueTemplatesSettings />
      </MainLayout>
   );
}
