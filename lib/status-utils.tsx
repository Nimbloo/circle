import React from 'react';
import { useCatalogStore } from '@/store/catalog-store';

/** Status do catálogo vivo (issue ou projeto) pelo id; `undefined` se não existe. */
export function getStatusById(statusId: string) {
   const { statuses, projectStatuses } = useCatalogStore.getState();
   return (
      statuses.find((item) => item.id === statusId) ??
      projectStatuses.find((item) => item.id === statusId)
   );
}

export function renderStatusIcon(statusId: string): React.ReactElement | null {
   const selectedItem = getStatusById(statusId);
   if (!selectedItem) return null;
   const Icon = selectedItem.icon;
   return <Icon />;
}
