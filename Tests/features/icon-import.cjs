'use strict';
// Executes actual import service against isolated in-memory files/images only.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'Resources/WM2 Support.dsa'),'utf8'),cases=[];
const RESOURCE='C:/WM2/Resources',SOURCE='C:/External/Duvet.png',TARGET=RESOURCE+'/Duvet.png';
const normalize=p=>path.win32.normalize(String(p)).replace(/\\/g,'/');
function fixture(options={}) {
  const files=new Map(),events=[],key=p=>normalize(p).toLowerCase();
  const put=(p,value)=>files.set(key(p),{...value,path:normalize(p)});
  put(RESOURCE,{dir:true});put(SOURCE,{raw:'verified PNG bytes',png:true});
  if(options.existing)put(TARGET,options.existing);
  const entry=p=>files.get(key(p));
  class Info {
    constructor(p){this.path=normalize(p);}
    setCaching(value){assert.equal(value,false);}
    isAbsolute(){return /^[A-Za-z]:\//.test(this.path);}
    exists(){return !!entry(this.path);}
    isDir(){return !!entry(this.path)?.dir;}
    isFile(){return !!entry(this.path)&&!entry(this.path).dir;}
    isReadable(){return this.isFile()&&!entry(this.path).unreadable;}
    fileName(){return path.posix.basename(this.path);}
    absoluteFilePath(){return this.path;}
    canonicalFilePath(){return entry(this.path)?.canonical || (this.exists()?this.path:'');}
    size(){return Buffer.byteLength(entry(this.path)?.raw||'');}
  }
  class File extends Info {
    copy(target){events.push({operation:'copy',source:this.path,target:normalize(target)});if(options.race)put(target,{raw:'FOREIGN',png:true});if(entry(target)||options.copyFailure)return false;put(target,{...entry(this.path),...(options.copied||{})});return true;}
    errorString(){return 'injected copy error';}
    deleteLater(){this.deleted=true;}
  }
  class Pixmap {constructor(p){const e=entry(p);this.width=e?.png&&!e.unreadable?24:0;this.height=this.width;}isNull(){return !this.width;}}
  const context=vm.createContext({DzFileInfo:Info,DzFile:File,Pixmap});vm.runInContext(source,context);
  return {support:context.WM2Support,files,events,put,entry,run:(name,src=SOURCE,resource=RESOURCE)=>context.WM2Support.importIcon(resource,src,name)};
}
function test(name,fn){try{fn();cases.push({name,pass:true});}catch(e){cases.push({name,pass:false,error:e.stack});}}
test('external valid PNG retains basename and verifies copied image',()=>{const f=fixture(),r=f.run();assert(r.ok);assert.equal(r.icon,'Duvet.png');assert.equal(r.status,'imported');assert.equal(f.entry(TARGET).raw,f.entry(SOURCE).raw);assert.equal(f.events.length,1);});
test('same canonical Resources file is reused without self-copy',()=>{const f=fixture({existing:{raw:'existing PNG',png:true}}),r=f.run(undefined,TARGET);assert(r.ok);assert.equal(r.status,'existing');assert.equal(r.icon,'Duvet.png');assert.equal(f.events.length,0);});
test('canonical source alias and Windows case variants are reused',()=>{const f=fixture({existing:{raw:'existing PNG',png:true}});f.put(SOURCE,{raw:'existing PNG',png:true,canonical:'c:/wm2/resources/DUVET.png'});const r=f.run();assert(r.ok);assert.equal(r.status,'existing');assert.equal(f.events.length,0);});
test('dot components canonicalize and do not cause self-copy',()=>{const f=fixture({existing:{raw:'existing PNG',png:true}});assert(f.run(undefined,RESOURCE+'/../Resources/Duvet.png').ok);assert.equal(f.events.length,0);});
test('different existing destination is a collision and never overwritten',()=>{const f=fixture({existing:{raw:'KEEP EXACTLY',png:true}}),r=f.run();assert.equal(r.ok,false);assert.equal(r.status,'collision');assert.equal(r.icon,null);assert.equal(f.entry(TARGET).raw,'KEEP EXACTLY');assert.equal(f.events.length,0);});
test('explicit chosen filename imports alongside existing original basename',()=>{const f=fixture({existing:{raw:'KEEP',png:true}}),r=f.run('Chosen.png');assert(r.ok);assert.equal(r.icon,'Chosen.png');assert.equal(f.entry(TARGET).raw,'KEEP');assert.equal(f.entry(RESOURCE+'/Chosen.png').raw,f.entry(SOURCE).raw);});
test('late collision is caught by non-overwriting copy and retains foreign bytes',()=>{const f=fixture({race:true}),r=f.run();assert.equal(r.status,'collision');assert.equal(r.icon,null);assert.equal(f.entry(TARGET).raw,'FOREIGN');});
test('copy failure does not publish a target icon',()=>{const f=fixture({copyFailure:true}),r=f.run();assert.equal(r.ok,false);assert.equal(r.icon,null);assert.equal(f.entry(TARGET),undefined);});
for(const copied of [{raw:''},{png:false},{unreadable:true}])test('failed destination validation '+JSON.stringify(copied)+' does not publish icon',()=>{const f=fixture({copied}),r=f.run();assert.equal(r.ok,false);assert.equal(r.icon,null);});
test('unreadable/missing/non-PNG source fails before copying',()=>{for(const detail of [{unreadable:true},{png:false}]){const f=fixture();f.put(SOURCE,{raw:'BAD',...detail});assert.equal(f.run().ok,false);assert.equal(f.events.length,0);}const f=fixture();assert.equal(f.run(undefined,'C:/Missing.png').ok,false);assert.equal(f.events.length,0);});
test('unsafe rename names are refused without destination writes',()=>{for(const name of ['../other.png','C:/other.png','bad.jpg','.hidden.png','CON.png','', 'a'.repeat(129)+'.png']){const f=fixture(),r=f.run(name);assert.equal(r.ok,false,name);assert.equal(r.icon,null);assert.equal(f.events.length,0);}});
test('missing/relative Resources is refused before copying',()=>{for(const resource of ['Resources','C:/Missing']){const f=fixture();assert.equal(f.run(undefined,SOURCE,resource).ok,false);assert.equal(f.events.length,0);}});
test('resource PNG basename with original case/spaces is preserved',()=>{const f=fixture();f.put('C:/External/My DUVET.PNG',{raw:'PNG',png:true});const r=f.run(undefined,'C:/External/My DUVET.PNG');assert(r.ok);assert.equal(r.icon,'My DUVET.PNG');});
const report={nativeExecuted:false,filesystemWrites:false,passed:cases.filter(x=>x.pass).length,failed:cases.filter(x=>!x.pass).length,cases};
fs.writeFileSync(path.join(root,'.test-output/features-icon-import.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,nativeExecuted:false}));for(const c of cases.filter(x=>!x.pass))console.error(c.name+'\n'+c.error);process.exitCode=report.failed?1:0;
