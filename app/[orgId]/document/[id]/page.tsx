import { DocumentEditor } from '@/components/common/documents/document-editor';
import MainLayout from '@/components/layout/main-layout';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
   const { id } = await params;
   return (
      <MainLayout>
         <DocumentEditor documentId={id} />
      </MainLayout>
   );
}
