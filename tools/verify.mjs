/* The self-verify loop, in one command. Runs every check and reports a table.
   Exits non-zero if any check fails, so CI and the build log agree on what "green" means. */
import { spawnSync } from 'node:child_process';

/** @type {[string, string, string[]][]} */
const STEPS = [
  ['build', 'npm', ['run', '--silent', 'build']],
  ['typecheck', 'npx', ['tsc', '--noEmit']],
  ['lint', 'npx', ['eslint', '.']],
  ['test', 'npx', ['vitest', 'run', '--reporter=dot']],
  ['audit', 'node', ['tools/audit.mjs']]
];

const results = [];
for (const [name, cmd, args] of STEPS) {
  process.stdout.write(`\n=== ${name} ===\n`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  results.push([name, r.status === 0]);
}

const pad = s => s.padEnd(11);
console.log('\n----- VERIFY -----');
for (const [name, ok] of results) console.log(` ${pad(name)} ${ok ? 'pass' : 'FAIL'}`);
const failed = results.filter(([, ok]) => !ok);
console.log(failed.length ? `\n${failed.length} check(s) failed\n` : '\nALL CHECKS PASS\n');
process.exit(failed.length ? 1 : 0);
