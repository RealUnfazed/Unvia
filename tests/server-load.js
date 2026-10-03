// Loads server.js with stand-in packages so start-up mistakes (e.g. using a const before it exists) fail here, not in production.
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const nm = path.join(os.tmpdir(), 'unvia-stubs', 'node_modules');
const mod = (name, code) => { fs.mkdirSync(path.join(nm, name), { recursive: true }); fs.writeFileSync(path.join(nm, name, 'index.js'), code); };
mod('express', `const routes=[];function express(){const app=()=>{};for(const m of ['get','post','put','patch','delete','use'])app[m]=(...a)=>{routes.push(m);return app};app.listen=()=>{};return app}express.json=()=>()=>{};express.static=()=>()=>{};express._routes=routes;module.exports=express;`);
mod('cors', 'module.exports=()=>()=>{};'); mod('dotenv', 'module.exports={config(){}};');
mod('bcryptjs', 'module.exports={hash:async()=>"h",compare:async()=>true};'); mod('jsonwebtoken', 'module.exports={sign:()=>"t",verify:()=>({})};');
mod('multer', 'const mw=()=>()=>{};function multer(){return{single:mw,array:mw,fields:mw}}multer.memoryStorage=()=>({});module.exports=multer;');
mod('mongoose', 'class Schema{constructor(d){this.d=d}index(){}}Schema.Types={ObjectId:"ObjectId",Mixed:"Mixed"};const models={};module.exports={Schema,models,model:(n)=>(models[n]=class{static find(){}}),connect:async()=>{}};');
const code = `require(${JSON.stringify(path.join(__dirname, '..', 'server.js'))});console.log(require('express')._routes.length)`;
const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', env: { ...process.env, NODE_PATH: nm } });
const n = parseInt((r.stdout || '').trim());
if (r.status === 0 && n > 100) console.log(`server.js loads cleanly (${n} routes registered)`);
else { console.log('FAIL: server.js did not load\n' + (r.stderr || r.stdout).split('\n').slice(0, 6).join('\n')); process.exit(1); }
