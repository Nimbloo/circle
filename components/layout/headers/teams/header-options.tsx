'use client';

import { Filter } from './filter';
import { DisplayOptions } from '../display-options';

export default function HeaderOptions() {
   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <Filter />
         <DisplayOptions />
      </div>
   );
}
