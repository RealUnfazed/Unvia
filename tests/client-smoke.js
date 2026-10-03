// Runs the real browser script against a fake DOM and fake API, renders every page and fires the click/form handlers.
// Catches runtime errors, broken markup ("undefined", "NaN") and unescaped user text that a syntax check cannot.
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
if (!m) { console.log('could not find the app script in public/index.html'); process.exit(1); }
const read = (f) => fs.readFileSync(path.join(__dirname, 'client', f), 'utf8');
const out = path.join(os.tmpdir(), 'unvia-client-smoke.js');
fs.writeFileSync(out, read('stubs.js') + '\n' + m[1] + '\n' + read('cases.js'));
const r = spawnSync(process.execPath, [out], { encoding: 'utf8' });
process.stdout.write(r.stdout); process.stderr.write(r.stderr);
process.exit(r.status || 0);
