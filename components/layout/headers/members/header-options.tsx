'use client';

import { Filter } from './filter';
import { ViewBar } from '@/components/layout/header-primitives';

export default function HeaderOptions() {
   return (
      <ViewBar>
         <Filter />
      </ViewBar>
   );
}
