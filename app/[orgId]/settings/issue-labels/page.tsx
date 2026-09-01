import MainLayout from '@/components/layout/main-layout';
import IssueLabelsSettings from '@/components/common/settings/issue-labels-settings';
import Header from '@/components/layout/headers/settings/header';

export default function Page() {
   return (
      <MainLayout header={<Header />}>
         <IssueLabelsSettings />
      </MainLayout>
   );
}
