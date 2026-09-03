'use client';

import { Badge } from '@/components/ui/badge';
import { Project } from '@/data/projects';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export function ProjectBadge({ project }: { project: Project }) {
   const params = useParams<{ orgId?: string }>();
   const orgId = params?.orgId ?? 'nimbloo';
   return (
      <Link
         href={`/${orgId}/project/${project.id}/overview`}
         className="flex items-center justify-center gap-.5"
      >
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
