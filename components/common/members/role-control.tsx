'use client';

/**
 * Papel de um membro, SOMENTE LEITURA (#52). A fonte única é o Keycloak/Orbis: o papel é
 * re-sincronizado a cada login, então editar aqui seria desfeito no acesso seguinte. A
 * dica (title) diz onde alterar.
 */
export function RoleControl({ role, className }: { role: string; className?: string }) {
   return (
      <span
         className={className}
         title="Role is managed in Keycloak (Orbis) and synced on every sign-in"
      >
         {role}
      </span>
   );
}
