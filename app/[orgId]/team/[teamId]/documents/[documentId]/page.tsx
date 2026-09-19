import TeamDocumentView from '@/components/common/teams/team-document';
import MainLayout from '@/components/layout/main-layout';

export default async function TeamDocumentPage({
   params,
}: {
   params: Promise<{ teamId: string; documentId: string }>;
}) {
   const { teamId, documentId } = await params;
   return (
      <MainLayout>
         <TeamDocumentView teamId={teamId} documentId={documentId} />
      </MainLayout>
   );
}
