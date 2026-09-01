import { Badge } from '@/components/ui/badge';
import { LabelInterface } from '@/data/labels';

export function LabelBadge({ label }: { label: LabelInterface[] }) {
   return (
      <>
         {label.map((l) => (
            <Badge
               key={l.id}
               variant="outline"
               className="h-6 gap-1.5 rounded-full bg-background px-2 py-0 text-muted-foreground"
            >
               <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: l.color }}
                  aria-hidden="true"
               ></span>
               {l.name}
            </Badge>
         ))}
      </>
   );
}
