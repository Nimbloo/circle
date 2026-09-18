'use client';

import { InitiativeStatus } from '@/data/initiatives';

/** Linear-style initiative status icon: dashed planned ring, partial active pie, check when completed. */
export function InitiativeStatusIcon({
   status,
   size = 14,
}: {
   status: InitiativeStatus;
   size?: number;
}) {
   if (status === 'planned' || status === 'proposed') {
      // proposed = anel tracejado mais claro; planned = tracejado cinza.
      return (
         <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
            <circle
               cx="8"
               cy="8"
               r="5.5"
               fill="none"
               className={
                  status === 'proposed' ? 'stroke-initiative-proposed' : 'stroke-initiative-planned'
               }
               strokeWidth="1.6"
               strokeDasharray="2.4 2"
            />
         </svg>
      );
   }
   if (status === 'canceled') {
      return (
         <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
            <circle cx="8" cy="8" r="7" className="fill-initiative-canceled" />
            <path
               d="M5.4 5.4 L10.6 10.6 M10.6 5.4 L5.4 10.6"
               stroke="white"
               strokeWidth="1.5"
               strokeLinecap="round"
            />
         </svg>
      );
   }
   if (status === 'completed') {
      return (
         <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
            <circle cx="8" cy="8" r="7" className="fill-primary" />
            <path
               d="M5 8.2 7.2 10.4 11 6.2"
               fill="none"
               stroke="white"
               strokeWidth="1.6"
               strokeLinecap="round"
               strokeLinejoin="round"
            />
         </svg>
      );
   }
   // active — yellow ring with a partial pie
   return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
         <circle
            cx="8"
            cy="8"
            r="5.5"
            fill="none"
            className="stroke-initiative-active"
            strokeWidth="1.6"
         />
         <path d="M8 8 L8 3.6 A4.4 4.4 0 0 1 12.4 8 Z" className="fill-initiative-active" />
      </svg>
   );
}
