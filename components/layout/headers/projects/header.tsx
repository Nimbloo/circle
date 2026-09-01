import HeaderNav from './header-nav';
import { ViewBar } from '@/components/layout/header-primitives';
import { ProjectsViewControls } from './projects-view-controls';

export default function Header() {
   return (
      <>
         <HeaderNav />
         <ViewBar>
            <ProjectsViewControls />
         </ViewBar>
      </>
   );
}
