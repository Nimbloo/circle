import AllIssues from '@/components/common/issues/all-issues';
import Header from '@/components/layout/headers/issues/header';
import MainLayout from '@/components/layout/main-layout';

/** "All Pending": tudo que não está concluído/cancelado (estilo Linear). */
export default function PendingIssuesPage() {
   return (
      <MainLayout header={<Header />}>
         <AllIssues categories={['triage', 'backlog', 'unstarted', 'started']} />
      </MainLayout>
   );
}
