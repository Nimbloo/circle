import type { Db } from '@/db';
import { team } from '@/db/schema';

/** Semeia um time para os testes de issue (FK obrigatória). */
export async function seedTeam(db: Db, id = 'CORE', name = 'LNDev Core') {
   await db
      .insert(team)
      .values({ id, name, icon: '🛠️', color: '#FF0000', issueSeq: 0 })
      .onConflictDoNothing();
   return id;
}
