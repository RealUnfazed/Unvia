// Runs the real browser script against a fake DOM and fake API, renders every page and fires the click/form handlers.
// Catches runtime errors, broken markup ("undefined", "NaN") and unescaped user text that a syntax check cannot.
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const { clientSrc, clientCss, read: readProject } = require('./lib/source');
// The page is index.html + css/app.css + the scripts in public/js (loaded in index.html order, one shared scope).
const html = readProject('public/index.html') + '\n' + clientCss(), script = clientSrc();
if (!script.includes('CLICK = []')) { console.log('could not find the app scripts listed in public/index.html'); process.exit(1); }
const read = (f) => fs.readFileSync(path.join(__dirname, 'client', f), 'utf8');
const out = path.join(os.tmpdir(), 'unvia-client-smoke.js');
fs.writeFileSync(out, `globalThis.html_ = ${JSON.stringify(html)};\n` + read('stubs.js') + '\n' + script + '\n' + read('cases.js'));
const r = spawnSync(process.execPath, [out], { encoding: 'utf8' });
process.stdout.write(r.stdout); process.stderr.write(r.stderr);
process.exit(r.status || 0);
