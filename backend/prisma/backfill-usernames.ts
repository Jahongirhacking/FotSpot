import { PrismaClient } from '@prisma/client';
import { generateUsername } from '../src/users/username.util';

/**
 * Gives every account a handle.
 *
 * Handles were added after the platform had users, and the backfill was lazy —
 * `UsersService.findMe` minted one the next time an account read itself. That
 * left every account that had not signed in since without one, and a null handle
 * means `/players/@handle` cannot resolve them at all: the profile is reachable
 * by id and by nothing else, which is the opposite of what a handle is for.
 *
 * Idempotent: accounts that already have one are untouched, so this is safe to
 * run again after any import that creates users without going through
 * `AuthService`.
 *
 * Run with `pnpm backfill:usernames`.
 */
async function main() {
  const prisma = new PrismaClient();
  const pending = await prisma.user.findMany({
    where: { username: null },
    select: { id: true },
  });

  console.log(`${pending.length} account(s) without a handle`);
  let minted = 0;

  for (const user of pending) {
    // A collision is a coincidence — the space is ~13 million — so retry rather
    // than fail the whole run for one unlucky draw.
    for (let attempt = 0; attempt < 5; attempt++) {
      const username = generateUsername();
      const clash = await prisma.user.findUnique({ where: { username } });
      if (clash) continue;
      await prisma.user.update({ where: { id: user.id }, data: { username } });
      minted++;
      break;
    }
  }

  console.log(`minted ${minted}`);
  if (minted < pending.length) {
    console.error(`${pending.length - minted} account(s) could not be given one — run again`);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

void main();
