import { signOut } from 'next-auth/react';

/** Sai da conta: o item "Log out" do menu da org e o atalho ⌥⇧Q usam o MESMO caminho. */
export function logOut() {
   return signOut({ callbackUrl: '/login' });
}
