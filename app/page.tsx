import { redirect } from 'next/navigation';

/** Raiz → landing da org (que resolve o time default dinamicamente). */
export default function Home() {
   redirect('/nimbloo');
}
