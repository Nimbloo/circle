import { cn } from '@/lib/utils';
import { CircleAlert } from 'lucide-react';

export function ErrorState({
   title,
   description,
   action,
   className,
   role = 'alert',
}: {
   title: string;
   description: string;
   action?: React.ReactNode;
   className?: string;
   role?: 'alert' | 'status';
}) {
   return (
      <div
         role={role}
         aria-labelledby="error-state-title"
         className={cn(
            'flex min-h-svh w-full flex-col items-center justify-center bg-background px-6 py-12 text-center',
            className
         )}
      >
         <div className="flex max-w-md flex-col items-center">
            <div className="mb-5 flex size-10 items-center justify-center rounded-[10px] border bg-card text-muted-foreground shadow-[var(--card-shadow)]">
               <CircleAlert className="size-[18px]" aria-hidden="true" />
            </div>
            <h1 id="error-state-title" className="text-lg font-medium text-foreground">
               {title}
            </h1>
            <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{description}</p>
            {action && <div className="mt-5">{action}</div>}
         </div>
      </div>
   );
}
