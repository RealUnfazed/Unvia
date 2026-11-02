// Loads server.js with stand-in packages so start-up mistakes (e.g. using a const before it exists) fail here, not in production.
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const nm = path.join(os.tmpdir(), 'unvia-stubs', 'node_modules');
const mod = (name, code) => { fs.mkdirSync(path.join(nm, name), { recursive: true }); fs.writeFileSync(path.join(nm, name, 'index.js'), code); };
mod('express', `const routes=[];function express(){const app=()=>{};for(const m of ['get','post','put','patch','delete','use','disable'])app[m]=(...a)=>{routes.push(m);return app};app.listen=()=>{};return app}express.json=()=>()=>{};express.static=()=>()=>{};express._routes=routes;module.exports=express;`);
mod('cors', 'module.exports=()=>()=>{};'); mod('dotenv', 'module.exports={config(){}};');
mod('bcryptjs', 'module.exports={hash:async()=>"h",compare:async()=>true};'); mod('jsonwebtoken', 'module.exports={sign:()=>"t",verify:()=>({})};');
mod('multer', 'const mw=()=>()=>{};function multer(){return{single:mw,array:mw,fields:mw}}multer.memoryStorage=()=>({});module.exports=multer;');
mod('mongoose', 'class Schema{constructor(d){this.d=d}index(){}}Schema.Types={ObjectId:"ObjectId",Mixed:"Mixed"};const models={};module.exports={Schema,models,model:(n)=>(models[n]=class{static find(){}}),connect:async()=>{}};');
const code = `require(${JSON.stringify(path.join(__dirname, '..', 'server.js'))});console.log(require('express')._routes.length)`;
const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', env: { ...process.env, NODE_PATH: nm } });
const n = parseInt((r.stdout || '').trim());
if (r.status === 0 && n > 100) console.log(`server.js loads cleanly (${n} routes registered)`);
else { console.log('FAIL: server.js did not load\n' + (r.stderr || r.stdout).split('\n').slice(0, 6).join('\n')); process.exit(1); }
// Production must fail closed, but visibly: with no real JWT secret the server still starts and answers every API request with a clear 503 message, never a silent 500.
const cfgCode = `process.stdout.write(String(require(${JSON.stringify(path.join(__dirname, '..', 'server', 'config.js'))}).CONFIG_ERROR))`;
const cfg = (env) => spawnSync(process.execPath, ['-e', cfgCode], { encoding: 'utf8', env: { ...process.env, NODE_PATH: nm, ...env } });
const weak = cfg({ NODE_ENV: 'production', JWT_SECRET: '' }), strong = cfg({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) }), dev = cfg({ NODE_ENV: '', VERCEL_ENV: '', JWT_SECRET: '' });
if (weak.status === 0 && /JWT_SECRET must be set/.test(weak.stdout) && strong.stdout === 'null' && dev.stdout === 'null') console.log('production without a real JWT secret reports a clear setup error; a long secret (and local dev) is fine');
else { console.log('FAIL: production secret check', weak.stdout, strong.stdout, dev.stdout, weak.stderr.split('\n')[0]); process.exit(1); }
const mw = fs.readFileSync(path.join(__dirname, '..', 'server', 'middleware.js'), 'utf8');
if (!/CONFIG_ERROR \? res\.status\(503\)/.test(mw) || !/Can’t reach the database/.test(mw)) { console.log('FAIL: middleware must explain configuration and database problems with a 503'); process.exit(1); }
console.log('misconfiguration and database failures are answered with a readable 503');

// Every entry point Vercel or `npm start` uses must export the Express app itself (a function with .listen), not a wrapper object.
const entryCode = `const out = {}; for (const f of ['server.js', 'api/index.js', 'api/[...path].js']) { const m = require(${JSON.stringify(path.join(__dirname, '..'))} + '/' + f); out[f] = typeof m; if (f === 'server.js') out.listen = typeof m.listen; } process.stdout.write(JSON.stringify(out));`;
const ent = spawnSync(process.execPath, ['-e', entryCode], { encoding: 'utf8', env: { ...process.env, NODE_PATH: nm } });
let types = {}; try { types = JSON.parse(ent.stdout); } catch { /* reported below */ }
if (types['server.js'] === 'function' && types.listen === 'function' && types['api/index.js'] === 'function' && types['api/[...path].js'] === 'function') console.log('server.js and both api/ entries export the Express app (a function)');
else { console.log('FAIL: entry points must export the app itself', ent.stdout, (ent.stderr || '').split('\n')[0]); process.exit(1); }
