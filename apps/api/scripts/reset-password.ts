import { AuditAction, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { createInterface } from 'node:readline';

/**
 * Sets an account's password from the machine the app runs on.
 *
 * There is no "forgot password" flow, and there should not be: it would mean a
 * mail server, a token table and a new way in — three liabilities to recover a
 * single-user application whose owner already has a shell on the box. That
 * shell is the recovery mechanism, and this is it.
 *
 *   npm run auth:reset-password -- you@example.com          # prompts, hidden
 *   printf 'the-new-password' | npm run auth:reset-password -- you@example.com
 *
 * The password is never an argument: arguments land in shell history and in
 * the process list, where every other user on the machine can read them.
 *
 * What this does NOT touch is the vault. Its master password is a separate
 * secret, and the key that decrypts your secrets is derived from it — not from
 * the password reset here. That is the whole design: a server-side reset must
 * not be able to open the vault. If the master password is what is lost, no
 * script can help, and that is the property you are paying for.
 */

// Identical to auth.service.ts. argon2.verify reads its parameters back out of
// the encoded hash, so a mismatch would still log in — but it would silently
// leave one account weaker than the rest.
const PASSWORD_HASH_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const MIN_LENGTH = 12;

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    fail('Usage: npm run auth:reset-password -- you@example.com');
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      // Naming the accounts is fine here: you already have the database.
      const all = await prisma.user.findMany({ select: { email: true } });
      fail(`No account for ${email}. This instance has: ${all.map((r) => r.email).join(', ')}`);
    }

    const password = process.stdin.isTTY ? await prompt(user.email) : await readPipedLine();

    if (password.length < MIN_LENGTH) {
      fail(
        password.length === 0
          ? 'No password was given. Nothing was changed.'
          : `Too short — the application requires at least ${MIN_LENGTH} characters. Nothing was changed.`,
      );
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await argon2.hash(password, PASSWORD_HASH_OPTIONS) },
      }),
      // Same reasoning as changing it from inside the app: a refresh token
      // that survives a password reset defeats the reset.
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: AuditAction.PASSWORD_CHANGED,
          success: true,
          // Recorded as what it is. A reset performed on the server, with no
          // proof of the old password, is worth telling apart from one done by
          // someone who knew it.
          userAgent: 'reset-password script',
        },
      }),
    ]);

    console.warn(`\nPassword set for ${user.email}. Every existing session was signed out.`);
    console.warn('The vault master password is unchanged — it is a separate secret.');
  } finally {
    await prisma.$disconnect();
  }
}

/** Asks twice, with the terminal echo off, and insists the two agree. */
async function prompt(email: string): Promise<string> {
  const first = await hidden(`New password for ${email}: `);
  const again = await hidden('Again: ');
  if (first !== again) fail('Those do not match. Nothing was changed.');
  return first;
}

function hidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // readline has no "silent" mode, so the prompt is written once and every
    // echo after it is swallowed. Without this the password sits on screen for
    // anyone walking past, and in the scrollback afterwards.
    const output = rl as unknown as { output: NodeJS.WriteStream; _writeToOutput(v: string): void };
    let shown = false;
    output._writeToOutput = (value: string) => {
      if (!shown) {
        output.output.write(question);
        shown = true;
      }
      if (value.includes('\n')) output.output.write('\n');
    };

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** The first line of piped input, so the script can be automated. */
function readPipedLine(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => (buffer += chunk));
    process.stdin.on('error', reject);
    // `end`, not readline: piped input closes, and a readline prompt waiting on
    // a stream that has already ended resolves nothing and exits saying
    // nothing — which for a password reset means reporting success after
    // having done exactly nothing.
    process.stdin.on('end', () => resolve(buffer.split('\n')[0].trim()));
  });
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((error: unknown) => {
  // Never exit quietly. A reset that silently does nothing is worse than one
  // that fails, because the account is then locked in a way nobody is looking
  // for.
  console.error(`\nThe password was not changed: ${(error as Error).message}`);
  process.exit(1);
});
