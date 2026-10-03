// `npm test`: needs only Node 18+, no installs.
const { spawnSync } = require('child_process'), path = require('path');
let failed = 0;
for (const [name, file] of [['Server loads', 'server-load.js'], ['Core logic', 'logic.js'], ['Browser app (fake DOM + fake API)', 'client-smoke.js']]) {
  console.log(`\n== ${name} ==`);
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (r.status) failed++;
}
console.log(failed ? `\n${failed} test group(s) FAILED` : '\nAll test groups passed');
process.exit(failed ? 1 : 0);
