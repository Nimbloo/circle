import HeaderNav from './header-nav';
import { HeaderTitle, ViewBar } from '@/components/layout/header-primitives';

export default function Header() {
   return (
      <>
         <HeaderNav />
         <ViewBar>
            <HeaderTitle>All projects</HeaderTitle>
         </ViewBar>
      </>
   );
}
