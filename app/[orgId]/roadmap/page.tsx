import Roadmap from '@/components/common/roadmap/roadmap';
import Header from '@/components/layout/headers/roadmap/header';
import MainLayout from '@/components/layout/main-layout';

export default function RoadmapPage() {
   return (
      <MainLayout header={<Header />}>
         <Roadmap />
      </MainLayout>
   );
}
