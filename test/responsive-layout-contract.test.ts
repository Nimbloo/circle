import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
   readFileSync(join(process.cwd(), relativePath), 'utf8');

describe('responsive layout contract', () => {
   it('mantém um estado vazio útil no inbox quando o painel de preview não existe', () => {
      const inbox = readSource('components/common/inbox/inbox.tsx');

      expect(inbox).toContain('filteredNotifications.length === 0 && isMobile');
      expect(inbox).toContain('<NotificationPreview />');
   });

   it('transforma reviews em navegação de painel único no mobile', () => {
      const reviews = readSource('components/common/reviews/reviews.tsx');

      expect(reviews).toContain("selectedReviewId && 'max-md:hidden'");
      expect(reviews).toContain("!selectedReviewId && 'max-md:hidden'");
      expect(reviews).toContain('Back to reviews');
   });

   it('mantém a navegação de settings acessível no mobile', () => {
      const shared = readSource('components/common/settings/shared.tsx');
      const labels = readSource('components/common/settings/issue-labels-settings.tsx');
      const emojis = readSource('components/common/settings/emojis-settings.tsx');

      for (const source of [shared, labels, emojis]) {
         expect(source).toContain('SidebarTrigger');
         expect(source).toContain('md:hidden');
      }
   });

   it('empilha integrações habilitadas sem criar overflow horizontal', () => {
      const integrations = readSource('components/common/settings/integrations.tsx');

      expect(integrations).toContain('grid grid-cols-1 gap-4 sm:grid-cols-3');
      expect(integrations).not.toContain('w-[202px]');
   });
});
