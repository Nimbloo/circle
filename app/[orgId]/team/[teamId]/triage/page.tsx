import AllIssues from '@/components/common/issues/all-issues';
import { TriageSuggestionsQueue } from '@/components/common/issues/triage/triage-suggestions-queue';
import Header from '@/components/layout/headers/issues/header';
import MainLayout from '@/components/layout/main-layout';

/** Fila de Triage do time (paridade Linear): issues na categoria triage aguardando
 * classificação. Ações Accept/Decline via context menu; snooze esconde da fila.
 * Acima da fila, os cards "Suggested" (#94) — a fila renderiza sem esperar por eles. */
export default function TriageIssuesPage() {
   return (
      <MainLayout header={<Header />}>
         <div className="flex h-full w-full flex-col overflow-hidden">
            <TriageSuggestionsQueue />
            <div className="min-h-0 flex-1">
               <AllIssues categories={['triage']} />
            </div>
         </div>
      </MainLayout>
   );
}
