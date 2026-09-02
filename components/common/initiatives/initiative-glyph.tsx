import type { CSSProperties, ComponentType } from 'react';
import {
   Activity,
   Anchor,
   Award,
   Bell,
   BookOpen,
   Box,
   BriefcaseBusiness,
   Building2,
   Circle,
   Cloud,
   Code2,
   Compass,
   Cpu,
   Database,
   Flag,
   Gem,
   Globe2,
   Goal,
   Heart,
   KeyRound,
   Layers3,
   Lightbulb,
   Lock,
   Map,
   Megaphone,
   Milestone,
   Mountain,
   Package,
   Puzzle,
   Rocket,
   Shield,
   Sparkles,
   Star,
   Sun,
   Target,
   Telescope,
   Trophy,
   Users,
   WandSparkles,
   Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type GlyphComponent = ComponentType<{ className?: string; style?: CSSProperties }>;

export const INITIATIVE_GLYPHS: { key: string; label: string; icon: GlyphComponent }[] = [
   { key: 'target', label: 'Target', icon: Target },
   { key: 'goal', label: 'Goal', icon: Goal },
   { key: 'rocket', label: 'Rocket', icon: Rocket },
   { key: 'sparkles', label: 'Sparkles', icon: Sparkles },
   { key: 'compass', label: 'Compass', icon: Compass },
   { key: 'flag', label: 'Flag', icon: Flag },
   { key: 'lightbulb', label: 'Lightbulb', icon: Lightbulb },
   { key: 'zap', label: 'Zap', icon: Zap },
   { key: 'milestone', label: 'Milestone', icon: Milestone },
   { key: 'activity', label: 'Activity', icon: Activity },
   { key: 'anchor', label: 'Anchor', icon: Anchor },
   { key: 'award', label: 'Award', icon: Award },
   { key: 'bell', label: 'Bell', icon: Bell },
   { key: 'book-open', label: 'Book', icon: BookOpen },
   { key: 'box', label: 'Box', icon: Box },
   { key: 'briefcase', label: 'Briefcase', icon: BriefcaseBusiness },
   { key: 'building', label: 'Building', icon: Building2 },
   { key: 'circle', label: 'Circle', icon: Circle },
   { key: 'cloud', label: 'Cloud', icon: Cloud },
   { key: 'code', label: 'Code', icon: Code2 },
   { key: 'cpu', label: 'CPU', icon: Cpu },
   { key: 'database', label: 'Database', icon: Database },
   { key: 'gem', label: 'Gem', icon: Gem },
   { key: 'globe', label: 'Globe', icon: Globe2 },
   { key: 'heart', label: 'Heart', icon: Heart },
   { key: 'key', label: 'Key', icon: KeyRound },
   { key: 'layers', label: 'Layers', icon: Layers3 },
   { key: 'lock', label: 'Lock', icon: Lock },
   { key: 'map', label: 'Map', icon: Map },
   { key: 'megaphone', label: 'Megaphone', icon: Megaphone },
   { key: 'mountain', label: 'Mountain', icon: Mountain },
   { key: 'package', label: 'Package', icon: Package },
   { key: 'puzzle', label: 'Puzzle', icon: Puzzle },
   { key: 'shield', label: 'Shield', icon: Shield },
   { key: 'star', label: 'Star', icon: Star },
   { key: 'sun', label: 'Sun', icon: Sun },
   { key: 'telescope', label: 'Telescope', icon: Telescope },
   { key: 'trophy', label: 'Trophy', icon: Trophy },
   { key: 'users', label: 'Users', icon: Users },
   { key: 'wand', label: 'Wand', icon: WandSparkles },
];

export const INITIATIVE_ICON_COLORS = [
   { key: 'gray', label: 'Gray', value: 'var(--muted-foreground)' },
   { key: 'violet', label: 'Violet', value: 'var(--primary)' },
   { key: 'blue', label: 'Blue', value: 'var(--chart-3)' },
   { key: 'cyan', label: 'Cyan', value: 'var(--chart-2)' },
   { key: 'green', label: 'Green', value: 'var(--review-open)' },
   { key: 'yellow', label: 'Yellow', value: 'var(--cycle-started)' },
   { key: 'orange', label: 'Orange', value: 'var(--chart-4)' },
   { key: 'red', label: 'Red', value: 'var(--destructive)' },
   { key: 'pink', label: 'Pink', value: 'var(--chart-5)' },
] as const;

export function initiativeIconColor(color?: string | null): string {
   if (color && /^#[0-9a-f]{6}$/i.test(color)) return color;
   return (
      INITIATIVE_ICON_COLORS.find((candidate) => candidate.key === color)?.value ??
      'var(--muted-foreground)'
   );
}

export function InitiativeGlyph({
   icon,
   color,
   className,
}: {
   icon: string;
   color?: string | null;
   className?: string;
}) {
   const entry = INITIATIVE_GLYPHS.find((candidate) => candidate.key === icon);
   if (!entry) {
      return (
         <span className={cn('text-base leading-none', className)} aria-hidden="true">
            {icon || '🎯'}
         </span>
      );
   }

   const Icon = entry.icon;
   return (
      <Icon className={cn('size-4', className)} style={{ color: initiativeIconColor(color) }} />
   );
}
