import { Badge } from '@/components/ui/badge';
import { Project } from '@/data/projects';
import Link from 'next/link';

export function ProjectBadge({ project }: { project: Project }) {
   return (
      <Link href={`/nimbloo/projects/all`} className="flex items-center justify-center gap-.5">
         <Badge
            variant="outline"
            className="h-6 gap-1.5 rounded-full bg-background px-2 py-0 text-muted-foreground"
         >
            <project.icon size={16} />
            {project.name}
         </Badge>
      </Link>
   );
}
