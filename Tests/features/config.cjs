'use strict';
// Executes the actual ES5 support module against a bounded in-memory DzFile model.
// No product/native/config writes; only this runner's optional receipt is written.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');
const modulePath = process.argv[2] || path.join(__dirname, 'WM2 Support.dsa');
const receiptPath = process.argv[3] || path.join(__dirname, 'config-regressions.receipt.json');
const source = fs.readFileSync(modulePath, 'utf8');
const RESOURCE = 'C:/Test WM2/Resources';
const TARGET = RESOURCE + '/WM2 Settings.json';
const LEGACY = RESOURCE + '/Wearables Manager.json';
const BUILTINS = ['Genesis','Genesis2Female','Genesis2Male','Genesis3Female','Genesis3Male','Genesis8Female','Genesis8Male','Genesis8_1Female','Genesis8_1Male','Genesis9','Genesis9_1','Genesis10','Genesis10Female','Genesis10Male'];
const normalize = value => String(value).replace(/\\/g, '/').replace(/\/$/, '');
const json = value => JSON.parse(JSON.stringify(value));
function fixture(initial, faults) {
    const files = new Map();
    files.set(RESOURCE, {type:'dir'});
    files.set(LEGACY, {type:'file',raw:'{"legacy":"KEEP EXACTLY — untouched"}'});
    if (initial !== undefined) files.set(TARGET, typeof initial === 'string' ? {type:'file',raw:initial} : initial);
    const events = [];
    faults = faults || {};
    function invoke(operation, filename, args) {
        events.push({operation,path:filename,args:args || []});
        if (typeof faults[operation] === 'function') {
            const result = faults[operation]({files,events,path:filename,args:args || []});
            if (result && result.handled) return result;
        }
        return null;
    }
    class FileInfo {
        constructor(filename) { this.filename = normalize(filename); }
        setCaching() {}
        exists() { const h = invoke('exists',this.filename); return h ? h.value : files.has(this.filename); }
        isAbsolute() { return /^(?:[A-Za-z]:\/|\/)/.test(this.filename); }
        isDir() { return files.has(this.filename) && files.get(this.filename).type === 'dir'; }
        isFile() { return files.has(this.filename) && files.get(this.filename).type === 'file'; }
        isSymLink() { return !!(files.get(this.filename) || {}).symlink; }
        absoluteFilePath() { return this.filename; }
        size() { const h = invoke('size',this.filename); return h ? h.value : Buffer.byteLength((files.get(this.filename) || {}).raw || '', 'utf8'); }
        remove() {
            const h = invoke('remove',this.filename);
            if (h) return h.value;
            return files.delete(this.filename);
        }
    }
    class File extends FileInfo {
        constructor(filename) { super(filename); this.code=0; this.errorMessage=''; this.mode=0; }
        open(mode) {
            const h = invoke('open',this.filename,[mode]);
            if (h) { if(h.value!==true) {this.code=5;this.errorMessage='injected open failure';} return h.value; }
            if (mode===File.ReadOnly) {
                const entry=files.get(this.filename);
                if(!entry || entry.type!=='file' || entry.unreadable) {this.code=1;this.errorMessage='unreadable';return false;}
            } else if (mode===File.WriteOnly) files.set(this.filename,{type:'file',raw:''});
            else throw new Error('Unexpected open flags: '+mode);
            this.mode=mode; this.code=0; return true;
        }
        close() { invoke('close',this.filename); this.mode=0; this.errorMessage=''; }
        error() { const h=invoke('error',this.filename); return h ? h.value : this.code; }
        errorString() { return this.errorMessage; }
        read() {
            const h=invoke('read',this.filename);
            return h ? h.value : (files.get(this.filename) || {}).raw;
        }
        write(raw) {
            const h=invoke('write',this.filename,[raw]);
            if(h) return h.value;
            files.set(this.filename,{type:'file',raw});
            return Buffer.byteLength(raw,'utf8');
        }
        rename(to) {
            to=normalize(to);
            const h=invoke('rename',this.filename,[to]);
            if(h) return h.value;
            if(!files.has(this.filename) || files.has(to)) return false;
            files.set(to,files.get(this.filename)); files.delete(this.filename); this.filename=to; return true;
        }
    }
    File.ReadOnly=1; File.WriteOnly=2; File.NoError=0;
    const context=vm.createContext({DzFile:File,DzFileInfo:FileInfo});
    vm.runInContext(source,context,{filename:modulePath});
    const support=context.WM2Support;
    return {support,files,events,faults,legacy:files.get(LEGACY).raw};
}
const tests=[];
function test(name,run) {
    try { run(); tests.push({name,pass:true}); }
    catch(error) { tests.push({name,pass:false,error:String(error),stack:error.stack}); }
}
function valid() { return {schema:1,iconRules:[],supportedFigures:BUILTINS.slice()}; }
function edited() { const config=valid(); config.iconRules.push({kind:'exactLabel',pattern:'Hair',icon:'Hair.png'}); return config; }
function noMutation(f) { assert.strictEqual(f.events.filter(e=>['write','rename','remove'].includes(e.operation)).length,0); }
function oldIntact(f,raw) { assert.strictEqual(f.files.get(TARGET).raw,raw); assert.strictEqual(f.files.get(LEGACY).raw,f.legacy); }
function extras(f) { return [...f.files.keys()].filter(name=>name!==RESOURCE && name!==TARGET && name!==LEGACY); }
function backups(f) { return extras(f).filter(name=>name.includes('.wm2-bak-')); }

test('include performs no filesystem operations',()=>{const f=fixture();assert.deepStrictEqual(f.events,[]);});
test('defaults contain the exact installed 14 names',()=>{assert.deepStrictEqual(json(fixture().support.defaults()),valid());});
test('defaults are independent clones',()=>{const s=fixture().support;const a=s.defaults();a.supportedFigures.pop();a.iconRules.push({});assert.deepStrictEqual(json(s.defaults()),valid());});
test('clone recursively isolates rules and arrays',()=>{const s=fixture().support,a=edited(),b=s.clone(a);b.iconRules[0].pattern='Changed';b.supportedFigures.pop();assert.strictEqual(a.iconRules[0].pattern,'Hair');assert.strictEqual(a.supportedFigures.length,14);});
test('clone refuses cycles and executable values',()=>{const s=fixture().support,a={};a.self=a;assert.throws(()=>s.clone(a));assert.throws(()=>s.clone({f:()=>1}));});
test('all four icon rule kinds validate',()=>{const c=valid();c.iconRules=['exactName','exactLabel','labelPrefix','namePrefix'].map(kind=>({kind,pattern:'same',icon:'my icon.PNG'}));assert.strictEqual(fixture().support.validate(c).ok,true);});
test('empty supported list is intentionally valid',()=>{const c=valid();c.supportedFigures=[];assert.strictEqual(fixture().support.validate(c).ok,true);});
test('users can remove builtins and append exact custom names',()=>{const c=valid();c.supportedFigures=['Custom Wolf','My_Legacy_Genesis'];assert.strictEqual(fixture().support.validate(c).ok,true);});
test('validation does not trim or mutate literal names/patterns',()=>{const c=edited();c.iconRules[0].pattern=' Hair ';c.supportedFigures=[' Wolf '];const v=fixture().support.validate(c);assert.strictEqual(v.ok,true);assert.deepStrictEqual(json(v.config),c);v.config.iconRules[0].pattern='other';assert.strictEqual(c.iconRules[0].pattern,' Hair ');});
for(const value of [null,[],true,'config',0]) test('reject invalid config root '+String(value),()=>assert.strictEqual(fixture().support.validate(value).ok,false));
for(const key of ['other','__proto__','constructor']) test('reject unknown root key '+key,()=>{const c=JSON.parse(JSON.stringify(valid()).slice(0,-1)+',"'+key+'":1}');assert.strictEqual(fixture().support.validate(c).ok,false);});
for(const schema of [0,2,1.5,'1',true,null]) test('reject unsupported schema '+String(schema),()=>{const c=valid();c.schema=schema;assert.strictEqual(fixture().support.validate(c).ok,false);});
for(const key of ['schema','iconRules','supportedFigures']) test('reject missing field '+key,()=>{const c=valid();delete c[key];assert.strictEqual(fixture().support.validate(c).ok,false);});
test('reject duplicate literal icon rule even with different icon',()=>{const c=edited();c.iconRules.push({kind:'exactLabel',pattern:'Hair',icon:'Other.png'});assert.strictEqual(fixture().support.validate(c).ok,false);});
test('normalized label tie remains allowed for matcher row ordering',()=>{const c=edited();c.iconRules.push({kind:'exactLabel',pattern:'Hair (1)',icon:'Other.png'});assert.strictEqual(fixture().support.validate(c).ok,true);});
test('exactLabel containing only a terminal copy suffix is rejected',()=>{const c=edited();c.iconRules[0].pattern=' (1)';assert.strictEqual(fixture().support.validate(c).ok,false);});
test('prefix containing a copy suffix stays literal and valid',()=>{const c=edited();c.iconRules[0].kind='labelPrefix';c.iconRules[0].pattern=' (1)';assert.strictEqual(fixture().support.validate(c).ok,true);});
test('exact case-distinct patterns and names remain distinct',()=>{const c=edited();c.iconRules.push({kind:'exactLabel',pattern:'hair',icon:'Other.png'});c.supportedFigures=['Wolf','wolf'];assert.strictEqual(fixture().support.validate(c).ok,true);});
test('reject duplicate exact figure name',()=>{const c=valid();c.supportedFigures.push('Genesis');assert.strictEqual(fixture().support.validate(c).ok,false);});
test('reject inherited enumerable config fields',()=>{const c=Object.create({extra:true});Object.assign(c,valid());assert.strictEqual(fixture().support.validate(c).ok,false);});
test('reject sparse arrays',()=>{const c=valid();c.iconRules.length=1;assert.strictEqual(fixture().support.validate(c).ok,false);});
test('reject array custom properties',()=>{const c=valid();c.supportedFigures.extra='x';assert.strictEqual(fixture().support.validate(c).ok,false);});
test('reject 257 rules and names',()=>{const s=fixture().support,c=valid();c.iconRules=Array.from({length:257},(_,i)=>({kind:'exactName',pattern:'n'+i,icon:'Icon.png'}));assert.strictEqual(s.validate(c).ok,false);c.iconRules=[];c.supportedFigures=Array.from({length:257},(_,i)=>'n'+i);assert.strictEqual(s.validate(c).ok,false);});
test('permit 256 rules and names within file bound',()=>{const c=valid();c.iconRules=Array.from({length:256},(_,i)=>({kind:'exactName',pattern:'n'+i,icon:'Icon.png'}));c.supportedFigures=Array.from({length:256},(_,i)=>'n'+i);assert.strictEqual(fixture().support.validate(c).ok,true);});
for(const pattern of ['', ' ', 'line\nnext', '\u0000', '\ud800', 'p'.repeat(257)]) test('reject invalid pattern '+JSON.stringify(pattern),()=>{const c=edited();c.iconRules[0].pattern=pattern;assert.strictEqual(fixture().support.validate(c).ok,false);});
for(const icon of ['../Icon.png','..\\Icon.png','C:Icon.png','/Icon.png','Icon.jpg','.png','.hidden.png','a?.png','con.png','LPT1.png','a .png','icon.png ']) test('reject unsafe icon '+icon,()=>{const c=edited();c.iconRules[0].icon=icon;assert.strictEqual(fixture().support.validate(c).ok,false);});
test('reject rule user-code, regex and unknown fields',()=>{for(const rule of [{kind:'regex',pattern:'.*',icon:'a.png'},{kind:'exactName',pattern:'x',icon:'a.png',code:'eval'}]){const c=valid();c.iconRules=[rule];assert.strictEqual(fixture().support.validate(c).ok,false);}});
test('missing load returns defaults with reusable missing token',()=>{const f=fixture(),r=f.support.load(RESOURCE);assert.strictEqual(r.status,'missing');assert.strictEqual(r.readOnly,false);assert.strictEqual(typeof r.rawToken,'string');assert.deepStrictEqual(json(r.config),valid());noMutation(f);});
test('malformed JSON load warns without changing its bytes',()=>{const raw='{broken',f=fixture(raw),r=f.support.load(RESOURCE);assert.strictEqual(r.status,'invalid');assert.strictEqual(r.readOnly,false);assert.ok(r.message);assert.strictEqual(typeof r.rawToken,'string');oldIntact(f,raw);noMutation(f);});
test('invalid schema shape load warns without modifying original',()=>{const raw='{"schema":1,"unexpected":true}',f=fixture(raw),r=f.support.load(RESOURCE);assert.strictEqual(r.status,'invalid');oldIntact(f,raw);noMutation(f);});
test('future schema is read-only and cannot be saved with matching token',()=>{const raw='{"schema":2,"future":{"keep":true}}',f=fixture(raw),r=f.support.load(RESOURCE),saved=f.support.save(RESOURCE,edited(),r.rawToken);assert.strictEqual(r.status,'future-schema');assert.strictEqual(r.readOnly,true);assert.strictEqual(saved.ok,false);oldIntact(f,raw);noMutation(f);});
test('future schema remains refused even when old token is stale',()=>{const f=fixture(),token=f.support.load(RESOURCE).rawToken;const raw='{"schema":99}';f.files.set(TARGET,{type:'file',raw});assert.strictEqual(f.support.save(RESOURCE,edited(),token).ok,false);oldIntact(f,raw);noMutation(f);});
test('fractional newer schema remains read-only',()=>{const raw='{"schema":1.5}',f=fixture(raw),r=f.support.load(RESOURCE);assert.strictEqual(r.status,'future-schema');assert.strictEqual(f.support.save(RESOURCE,edited(),r.rawToken).ok,false);oldIntact(f,raw);noMutation(f);});
test('BOM JSON loads with exact raw token',()=>{const raw='\ufeff'+JSON.stringify(valid()),f=fixture(raw),r=f.support.load(RESOURCE);assert.strictEqual(r.status,'ok');assert.ok(r.rawToken.endsWith(raw));noMutation(f);});
test('unreadable target has no repair token and cannot be overwritten',()=>{const f=fixture({type:'file',raw:JSON.stringify(valid()),unreadable:true}),r=f.support.load(RESOURCE);assert.strictEqual(r.status,'unreadable');assert.strictEqual(r.rawToken,null);assert.strictEqual(f.support.save(RESOURCE,edited(),r.rawToken).ok,false);noMutation(f);});
test('symlink settings path is read-only',()=>{const f=fixture({type:'file',raw:JSON.stringify(valid()),symlink:true}),r=f.support.load(RESOURCE);assert.strictEqual(r.readOnly,true);assert.strictEqual(f.support.save(RESOURCE,edited(),r.rawToken).ok,false);noMutation(f);});
test('oversize input is not read or overwritten',()=>{const f=fixture('x'.repeat(262145)),r=f.support.load(RESOURCE);assert.strictEqual(r.status,'unreadable');assert.strictEqual(f.events.some(e=>e.operation==='read'),false);assert.strictEqual(f.support.save(RESOURCE,valid(),r.rawToken).ok,false);noMutation(f);});
test('relative or nonexistent resources path fails before mutation',()=>{const f=fixture();for(const dir of ['Resources','C:/missing',LEGACY]){const r=f.support.load(dir);assert.strictEqual(r.status,'path-error');assert.strictEqual(f.support.save(dir,valid(),r.rawToken).ok,false);}noMutation(f);});
test('first save produces valid roundtrip without touching legacy',()=>{const f=fixture(),r=f.support.load(RESOURCE),saved=f.support.save(RESOURCE,edited(),r.rawToken);assert.strictEqual(saved.ok,true);assert.strictEqual(f.support.load(RESOURCE).status,'ok');assert.deepStrictEqual(json(f.support.load(RESOURCE).config),edited());assert.strictEqual(f.files.get(LEGACY).raw,f.legacy);assert.deepStrictEqual(extras(f),[]);});
test('Unicode including astral characters roundtrips through ASCII disk JSON',()=>{const f=fixture(),c=edited();c.iconRules[0].pattern='Вовк 狼 🐺';c.iconRules[0].icon='Вовк.png';c.supportedFigures.push('Фігура🐺');const saved=f.support.save(RESOURCE,c,f.support.load(RESOURCE).rawToken);assert.strictEqual(saved.ok,true);assert.ok(!/[^\x00-\x7f]/.test(f.files.get(TARGET).raw));assert.deepStrictEqual(json(f.support.load(RESOURCE).config),c);});
test('valid update uses verified temp then backup rename and cleans backup',()=>{const raw=JSON.stringify(valid()),f=fixture(raw);const saved=f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken);assert.strictEqual(saved.ok,true);const actions=f.events.filter(e=>e.operation==='rename');assert.strictEqual(actions.length,2);assert.strictEqual(actions[0].path,TARGET);assert.ok(actions[0].args[0].includes('.wm2-bak-'));assert.strictEqual(actions[1].args[0],TARGET);assert.deepStrictEqual(extras(f),[]);assert.strictEqual(f.files.get(LEGACY).raw,f.legacy);});
test('corrupt repair requires explicit token and retains exact original backup',()=>{const raw='{broken — original',f=fixture(raw),r=f.support.load(RESOURCE);assert.strictEqual(f.support.save(RESOURCE,edited()).ok,false);oldIntact(f,raw);const saved=f.support.save(RESOURCE,edited(),r.rawToken);assert.strictEqual(saved.ok,true);assert.strictEqual(backups(f).length,1);assert.strictEqual(f.files.get(backups(f)[0]).raw,raw);assert.ok(saved.message.includes(backups(f)[0]));assert.strictEqual(f.files.get(LEGACY).raw,f.legacy);});
test('stale external edit is preserved without any write',()=>{const f=fixture(JSON.stringify(valid())),r=f.support.load(RESOURCE),raw='{"outside":"edit"}';f.files.set(TARGET,{type:'file',raw});assert.strictEqual(f.support.save(RESOURCE,edited(),r.rawToken).ok,false);oldIntact(f,raw);noMutation(f);});
test('missing token detects externally created file',()=>{const f=fixture(),r=f.support.load(RESOURCE),raw=JSON.stringify(valid());f.files.set(TARGET,{type:'file',raw});assert.strictEqual(f.support.save(RESOURCE,edited(),r.rawToken).ok,false);oldIntact(f,raw);noMutation(f);});
test('same valid canonical contents save performs no writes',()=>{const f=fixture(),first=f.support.save(RESOURCE,valid(),f.support.load(RESOURCE).rawToken);assert.strictEqual(first.ok,true);f.events.length=0;assert.strictEqual(f.support.save(RESOURCE,valid(),first.rawToken).ok,true);noMutation(f);});
test('invalid input fails before filesystem access',()=>{const f=fixture(),c=valid();c.iconRules=[{kind:'regex',pattern:'.*',icon:'x.png'}];assert.strictEqual(f.support.save(RESOURCE,c,'anything').ok,false);assert.deepStrictEqual(f.events,[]);});
test('serialized size bound fails before temporary creation',()=>{const f=fixture(),c=valid();c.iconRules=Array.from({length:256},(_,i)=>({kind:'exactName',pattern:('狼'.repeat(252)+i),icon:'x.png'}));assert.strictEqual(f.support.validate(c).ok,true);assert.strictEqual(f.support.save(RESOURCE,c,f.support.load(RESOURCE).rawToken).ok,false);noMutation(f);});
test('partial write leaves original target and legacy untouched',()=>{const raw=JSON.stringify(valid()),f=fixture(raw,{write:({files,path,args})=>{files.set(path,{type:'file',raw:args[0].slice(0,10)});return{handled:true,value:10};}});assert.strictEqual(f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken).ok,false);oldIntact(f,raw);assert.deepStrictEqual(extras(f),[]);});
test('reported write -1 leaves original intact',()=>{const raw=JSON.stringify(valid()),f=fixture(raw,{write:()=>({handled:true,value:-1})});assert.strictEqual(f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken).ok,false);oldIntact(f,raw);});
test('write exception leaves original intact and cleans owned temp',()=>{const raw=JSON.stringify(valid()),f=fixture(raw,{write:()=>{throw new Error('disk exception');}});assert.strictEqual(f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken).ok,false);oldIntact(f,raw);assert.deepStrictEqual(extras(f),[]);});
test('temporary readback mismatch leaves original intact',()=>{const raw=JSON.stringify(valid()),f=fixture(raw,{read:({path})=>path.includes('.wm2-tmp-')?{handled:true,value:'truncated'}:null});assert.strictEqual(f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken).ok,false);oldIntact(f,raw);assert.deepStrictEqual(extras(f),[]);});
test('temporary open failure preserves original',()=>{const raw=JSON.stringify(valid()),f=fixture(raw,{open:({path,args})=>args[0]===2?{handled:true,value:false}:null});assert.strictEqual(f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken).ok,false);oldIntact(f,raw);});
test('temporary name collision is never deleted',()=>{const raw=JSON.stringify(valid());let checks=0,foreign=null;const f=fixture(raw,{exists:({files,path})=>{if(path.includes('.wm2-tmp-')&&++checks===2){foreign=path;files.set(path,{type:'file',raw:'FOREIGN'});return{handled:true,value:true};}return null;}});assert.strictEqual(f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken).ok,false);oldIntact(f,raw);assert.strictEqual(f.files.get(foreign).raw,'FOREIGN');});
test('external edit during preparation is detected before backup rename',()=>{const raw=JSON.stringify(valid()),changed='{"external":"new"}',f=fixture(raw,{write:({files})=>{files.set(TARGET,{type:'file',raw:changed});return null;}});assert.strictEqual(f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken).ok,false);oldIntact(f,changed);assert.strictEqual(f.events.filter(e=>e.operation==='rename').length,0);assert.deepStrictEqual(extras(f),[]);});
test('backup rename failure preserves original and removes temp',()=>{const raw=JSON.stringify(valid()),f=fixture(raw,{rename:({path})=>path===TARGET?{handled:true,value:false}:null});assert.strictEqual(f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken).ok,false);oldIntact(f,raw);assert.deepStrictEqual(extras(f),[]);});
test('publish rename failure rolls back verified original',()=>{const raw=JSON.stringify(valid()),f=fixture(raw,{rename:({path})=>path.includes('.wm2-tmp-')?{handled:true,value:false}:null});assert.strictEqual(f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken).ok,false);oldIntact(f,raw);assert.deepStrictEqual(extras(f),[]);});
test('publish exception rolls back verified original',()=>{const raw=JSON.stringify(valid()),f=fixture(raw,{rename:({path})=>{if(path.includes('.wm2-tmp-'))throw new Error('publish exception');return null;}});assert.strictEqual(f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken).ok,false);oldIntact(f,raw);assert.deepStrictEqual(extras(f),[]);});
test('rollback failure retains original backup and reports its exact path',()=>{const raw=JSON.stringify(valid()),f=fixture(raw,{rename:({path})=>path!==TARGET?{handled:true,value:false}:null});const result=f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken);assert.strictEqual(result.ok,false);assert.strictEqual(f.files.has(TARGET),false);assert.strictEqual(backups(f).length,1);assert.strictEqual(f.files.get(backups(f)[0]).raw,raw);assert.ok(result.message.includes(backups(f)[0]));assert.strictEqual(f.files.get(LEGACY).raw,f.legacy);});
test('concurrent new target during publish failure is preserved with original backup',()=>{const raw=JSON.stringify(valid()),foreign='{"concurrent":"KEEP"}',f=fixture(raw,{rename:({files,path})=>{if(path.includes('.wm2-tmp-')){files.set(TARGET,{type:'file',raw:foreign});return{handled:true,value:false};}return null;}});const result=f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken);assert.strictEqual(result.ok,false);oldIntact(f,foreign);assert.strictEqual(f.files.get(backups(f)[0]).raw,raw);assert.ok(result.message.includes(backups(f)[0]));});
test('final readback failure reports failure and retains original backup',()=>{const raw=JSON.stringify(valid());let published=false;const f=fixture(raw,{rename:({path})=>{if(path.includes('.wm2-tmp-'))published=true;return null;},read:({path})=>path===TARGET&&published?{handled:true,value:'unexpected'}:null});const result=f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken);assert.strictEqual(result.ok,false);assert.strictEqual(f.files.get(backups(f)[0]).raw,raw);assert.ok(result.message.includes(backups(f)[0]));assert.strictEqual(f.files.get(LEGACY).raw,f.legacy);});
test('backup cleanup failure is successful save with recovery-location warning',()=>{const raw=JSON.stringify(valid()),f=fixture(raw,{remove:({path})=>path.includes('.wm2-bak-')?{handled:true,value:false}:null});const result=f.support.save(RESOURCE,edited(),f.support.load(RESOURCE).rawToken);assert.strictEqual(result.ok,true);assert.strictEqual(backups(f).length,1);assert.ok(result.message.includes(backups(f)[0]));assert.strictEqual(f.support.load(RESOURCE).status,'ok');});
test('enum FileError valueOf zero succeeds without Number coercion',()=>{const f=fixture(undefined,{error:()=>({handled:true,value:{valueOf:()=>0,toString:()=>'?'}})});assert.strictEqual(f.support.save(RESOURCE,valid(),f.support.load(RESOURCE).rawToken).ok,true);});
test('nonzero or unknown FileError fails closed',()=>{for(const code of [1,null,true,'0',{valueOf:()=>1},{valueOf:()=>undefined}]){const raw=JSON.stringify(valid()),f=fixture(raw,{error:()=>({handled:true,value:code})});assert.strictEqual(f.support.load(RESOURCE).status,'unreadable');assert.strictEqual(f.support.save(RESOURCE,edited(),null).ok,false);oldIntact(f,raw);noMutation(f);}});

const receipt={modulePath,sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),generatedAt:new Date().toISOString(),scope:'Actual shared module in Node; isolated mocked DzFile/DzFileInfo only. No native DAZ or product/config writes.',total:tests.length,passed:tests.filter(t=>t.pass).length,failed:tests.filter(t=>!t.pass).length,tests};
fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({total:receipt.total,passed:receipt.passed,failed:receipt.failed,receiptPath,sourceSHA256:receipt.sourceSHA256}));
for(const result of tests.filter(t=>!t.pass)) console.error(result.name+'\n'+result.stack);
process.exitCode=receipt.failed?1:0;
