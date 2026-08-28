import AllIssues from '@/components/common/issues/all-issues';
import Header from '@/components/layout/headers/issues/header';
import MainLayout from '@/components/layout/main-layout';

/** Fila de Triage do time (paridade Linear): issues na categoria triage aguardando
 * classificação. Ações Accept/Decline via context menu; snooze esconde da fila. */
export default function TriageIssuesPage() {
   return (
      <MainLayout header={<Header />}>
         <AllIssues categories={['triage']} />
      </MainLayout>
   );
}
