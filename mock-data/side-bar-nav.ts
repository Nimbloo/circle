import {
   Bot,
   GitPullRequestArrow,
   Inbox,
   FolderKanban,
   ContactRound,
   Box,
   Settings,
   Bell,
   KeyRound,
   Users,
   Tag,
   Layers,
   FileText,
   MessageSquare,
   Clock,
   Zap,
   UserRound,
} from 'lucide-react';

export const inboxItems = [
   {
      name: 'Inbox',
      url: '/inbox',
      icon: Inbox,
   },
   {
      name: 'Reviews',
      url: '/reviews',
      icon: GitPullRequestArrow,
   },
   {
      name: 'My issues',
      url: '/my-issues',
      icon: FolderKanban,
   },
   {
      name: 'Agent',
      url: '/agent',
      icon: Bot,
   },
];

export const workspaceItems = [
   {
      name: 'Teams',
      url: '/teams',
      icon: ContactRound,
   },
   {
      name: 'Projects',
      url: '/projects',
      icon: Box,
   },
   {
      name: 'Members',
      url: '/members',
      icon: UserRound,
   },
];

export const accountItems = [
   {
      name: 'Preferences',
      url: '/settings/preferences',
      icon: Settings,
   },
   {
      name: 'Profile',
      url: '/settings/profile',
      icon: UserRound,
   },
   {
      name: 'Notifications',
      url: '/settings/notifications',
      icon: Bell,
   },
   {
      name: 'Security & access',
      url: '/settings/security',
      icon: KeyRound,
   },
   {
      name: 'Connected accounts',
      url: '/settings/connected-accounts',
      icon: Users,
   },
];

export const featuresItems = [
   {
      name: 'Labels',
      url: '/settings/issue-labels',
      icon: Tag,
   },
   {
      name: 'Initiatives',
      url: '/settings/initiatives',
      icon: Layers,
   },
   {
      name: 'Customer requests',
      url: '/settings/customer-requests',
      icon: Inbox,
   },
   {
      name: 'Templates',
      url: '/settings/issue-templates',
      icon: FileText,
   },
   {
      name: 'Asks',
      url: '/settings/asks',
      icon: MessageSquare,
   },
   {
      name: 'SLAs',
      url: '/settings/slas',
      icon: Clock,
   },
   {
      name: 'Emojis',
      url: '/settings/emojis',
      icon: MessageSquare,
   },
   {
      name: 'Integrations',
      url: '/settings/integrations',
      icon: Zap,
   },
];
