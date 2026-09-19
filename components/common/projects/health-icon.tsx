import { AlertCircle, CircleCheck, CircleX, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { healthColor } from './progress-colors';

/** Ícone do health do projeto, pintado pelo token `--health-*` (pl#12). */
export function HealthIcon({ healthId, className }: { healthId: string; className?: string }) {
   const Icon =
      healthId === 'on-track'
         ? CircleCheck
         : healthId === 'off-track'
           ? CircleX
           : healthId === 'at-risk'
             ? AlertCircle
             : HelpCircle;
   return (
      <Icon
         className={cn('size-4 shrink-0', className)}
         style={{ color: healthId === 'no-update' ? undefined : healthColor(healthId) }}
      />
   );
}
