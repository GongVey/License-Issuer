import { hashPassword, loadSigningKey, publicKeyFor, openDatabase, initializeAdministrator, importAdministrator, updateAdministrator, requireAdministrator, validateUsername } from './lib.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';

const help = `Usage: npm run admin -- <command>
  init            Initialize an empty administrator table (interactive username and hidden password confirmation)
  init-default    Initialize an empty table as admin with a one-time random password
  reset-password  Set a new hidden password; revoke all administrator sessions
  rename          Change username interactively; revoke all administrator sessions
  import-env      One-time import of explicit ADMIN_USERNAME and ADMIN_PASSWORD_HASH; empty table only
  password-hash   Generate a legacy scrypt hash interactively
  check-key       Validate the configured signing key
  --help          Show this help
Account commands use only DATABASE_PATH (default ./data/issuer.sqlite), not signing keys.
No shared default password, password arguments, public registration, or automatic ENV import.
Protect the database, backups and local CLI access with OS permissions.
After import-env succeeds, remove ADMIN_USERNAME and ADMIN_PASSWORD_HASH from deployment secrets.`;

async function usernamePrompt(label) {
  if (!process.stdin.isTTY) throw new Error('Run in an interactive terminal');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return validateUsername(await rl.question(label)); } finally { rl.close(); }
}

async function hiddenPrompt(label) {
  if (!process.stdin.isTTY) throw new Error('Run in an interactive terminal; passwords are never accepted as CLI arguments');
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = error => {
      process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData);
      process.stdout.write('\n'); error ? reject(error) : resolve(value);
    };
    function onData(chunk) {
      for (const char of chunk) {
        if (char === '\u0003' || char === '\u0004') { finish(new Error('Cancelled')); return; }
        if (char === '\r' || char === '\n') { finish(); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ' && value.length < 257) value += char;
      }
    }
    process.stdin.on('data', onData);
  });
}
export async function runAdmin(command, env, { askUsername = usernamePrompt, askPassword = hiddenPrompt, output = console.log } = {}) {
  const newHash = async () => {
    const first = await askPassword('New administrator password (16-256 characters, hidden): ');
    const second = await askPassword('Confirm password (hidden): ');
    if (first !== second) throw new Error('Passwords do not match');
    return hashPassword(first);
  };
  if (!command || command === '--help' || command === 'help') { output(help); return; }
  if (command === 'password-hash') { output(await newHash()); return; }
  if (command === 'check-key') { output(`Verified signing public key: ${publicKeyFor(loadSigningKey(env))}`); return; }
  if (!['init', 'init-default', 'reset-password', 'rename', 'import-env'].includes(command)) throw new Error(help);
  const db = openDatabase(resolve(env.DATABASE_PATH || './data/issuer.sqlite'));
  try {
    if (command === 'init') {
      if (db.prepare('SELECT 1 FROM administrators LIMIT 1').get()) throw new Error('Administrator already initialized');
      const username = validateUsername(await askUsername('New administrator username: '));
      initializeAdministrator(db, username, await newHash());
    } else if (command === 'init-default') {
      if (db.prepare('SELECT 1 FROM administrators LIMIT 1').get()) throw new Error('Administrator already initialized');
      const password = randomBytes(24).toString('base64url');
      initializeAdministrator(db, 'admin', await hashPassword(password), true);
      output(`Initial administrator username: admin\nInitial administrator password (show once): ${password}`);
    } else if (command === 'import-env') {
      importAdministrator(db, env);
    } else {
      requireAdministrator(db);
      if (command === 'rename') updateAdministrator(db, { username: await askUsername('New administrator username: ') });
      else updateAdministrator(db, { passwordHash: await newHash() });
    }
    output('Administrator saved in SQLite. Previous administrator sessions have been revoked.');
  } finally { db.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error('No extra arguments accepted; use interactive prompts.');
    await runAdmin(process.argv[2], process.env);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
