'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {getFunction}=require('../support/Wearable Manager extract.cjs');
const root=path.resolve(__dirname,'../..'),supportPath=path.join(root,'Resources/Wearable Manager Support.dsa');
const source=fs.readFileSync(supportPath,'utf8'),wardrobe=fs.readFileSync(path.join(root,'Wearable Manager Wardrobe.dsa'),'utf8');
let passed=0;const measurements={};
function test(name,body){body();passed++;}
const configFixture=fs.readFileSync(path.join(__dirname,'Wearable Manager config.cjs'),'utf8').split('const tests=[];')[0];
const {fixture,RESOURCE,TARGET}=new Function('require','process',configFixture+';return {fixture,RESOURCE,TARGET};')(require,{argv:['node','test',supportPath,'unused']});
for(const schema of [1,2])test('legacy settings '+schema+' load without writes and save to the same file',()=>{
 const f=fixture(),old=RESOURCE+'/WM2 Settings.json',cfg=f.support.defaults();cfg.schema=schema;if(schema===1)delete cfg.protectedChildren;
 cfg.iconRules=[{kind:'exactName',pattern:'Hat',icon:'Wearables Manager - Hat.png'}];cfg.supportedFigures.push('MyCustomFigure');
 const raw=JSON.stringify(cfg);f.files.set(old,{type:'file',raw});
 const loaded=f.support.load(RESOURCE);assert.equal(loaded.status,'ok');assert.equal(loaded.config.iconRules[0].icon,cfg.iconRules[0].icon);
 assert(loaded.config.supportedFigures.includes('MyCustomFigure'));assert.equal(f.files.get(old).raw,raw);assert(!f.files.has(TARGET));
 assert(!f.events.some(e=>['write','rename','remove'].includes(e.operation)));
 const saved=f.support.save(RESOURCE,loaded.config,loaded.rawToken);assert(saved.ok,saved.message);assert(!f.files.has(TARGET));
});
test('legacy settings precedence, future schema and concurrent changes remain protected',()=>{
 const f=fixture(JSON.stringify({schema:2,iconRules:[],supportedFigures:[],protectedChildren:[]})),old=RESOURCE+'/WM2 Settings.json';
 f.files.set(old,{type:'file',raw:JSON.stringify(f.support.defaults())});const state=f.support.load(RESOURCE);assert(state.config.supportedFigures.length>0);
 f.files.set(old,{type:'file',raw:'{"schema":99}'});assert(!f.support.save(RESOURCE,state.config,state.rawToken).ok);
 assert.equal(f.support.load(RESOURCE).readOnly,true);assert.equal(f.files.get(old).raw,'{"schema":99}');
});
test('both icon readers resolve saved old names and preserve installed custom files',()=>{
 const sources=[source,wardrobe],names=['Wearables Manager - Hat.png','Wardrobe Sets Travel.png','Verified Outfit Hanger Icon.png','Wearables Manager - Coffe.PNG'];
 const expected=['Wearable Manager - Hat.png','Wearable Manager Wardrobe Sets Travel.png','Wearable Manager Worn.png','Wearable Manager - Coffee.png'];
 for(const text of sources){const resolve=vm.runInNewContext('('+getFunction(text,'WM2ResourceName').text+')');
  for(let i=0;i<names.length;i++){
   assert.equal(resolve({exists:n=>n.toLowerCase()===expected[i].toLowerCase()},names[i]),expected[i]);
   assert.equal(resolve({exists:()=>true},names[i]),names[i]);
  }
 }
});
test('Wardrobe keeps old preference path and resource directory is computed only once',()=>{
 let reads=0;const entries=new Set(['WM2 Settings.json','Wearables Manager.json','Wearable Manager - Hat.png']);
 const c=vm.createContext({wardrobeResourceDirectory:null,scriptDirectory(){reads++;return '/Product';},DzDir:function(){this.exists=n=>entries.has(n);this.deleteLater=()=>{};}});
 vm.runInContext(getFunction(wardrobe,'WM2ResourceName').text+'\n'+getFunction(wardrobe,'resourcePath').text,c);
 assert.equal(c.resourcePath('Wearable Manager Settings.json'),'/Product/Resources/WM2 Settings.json');
 assert.equal(c.resourcePath('Wearable Manager.json'),'/Product/Resources/Wearables Manager.json');
 assert.equal(c.resourcePath('Wearables Manager - Hat.png'),'/Product/Resources/Wearable Manager - Hat.png');assert.equal(reads,1);
});
test('Wardrobe accepts old schema and icon references without modifying input',()=>{
 const c=vm.createContext({FIGURES:fixture().support.defaults().supportedFigures,own:(o,k)=>Object.prototype.hasOwnProperty.call(o,k)});
 for(const name of ['wm2DefaultFigureSettings','wm2SettingsObject','wm2SettingsExactKeys','wm2SettingsDense','wm2SettingsName','wm2SettingsIconName','wm2ValidatedFigureSettings'])vm.runInContext(getFunction(wardrobe,name).text,c);
 for(const schema of [1,2]){const cfg=fixture().support.defaults();cfg.schema=schema;if(schema===1)delete cfg.protectedChildren;
  cfg.iconRules=[{kind:'labelPrefix',pattern:'Saved',icon:'Wardrobe Sets Travel.png',enabled:false}];
  const before=JSON.stringify(cfg),out=c.wm2ValidatedFigureSettings(cfg);assert.equal(JSON.stringify(cfg),before);assert.equal(out.iconRules[0].icon,'Wardrobe Sets Travel.png');assert.equal(out.iconRules[0].enabled,false);
 }
});
test('Menu checks protection only for visible roots, while excluding protected nested content',()=>{
 let prefix=fs.readFileSync(path.join(__dirname,'Wearable Manager protection.cjs'),'utf8').split("test('fresh schema2")[0];
 prefix=prefix.replace("fs.readFileSync(supportPath,'utf8')",'injectedSource');
 function measure(text){const world=new Function('require','__dirname','process','injectedSource',prefix+';return world;')(require,__dirname,{argv:[]},text);
  const w=world(),owner=new w.Node('Genesis9'),shirt=new w.Node('Shirt','DzNode',owner);for(let i=0;i<80;i++)new w.Node('Detail'+i,'DzNode',shirt);
  let calls=0;const original=w.support.isProtectedTransfer;w.support.isProtectedTransfer=function(){calls++;return original.apply(this,arguments);};
  let rows=w.support.menuGraph(w.c.Scene,w.config).attachedRoots(owner);assert.equal(rows.length,1);assert.equal(rows[0].name,'Shirt');
  const initial=calls;new w.Node('Genesis9Eyes','DzNode',shirt);rows=w.support.menuGraph(w.c.Scene,w.config).attachedRoots(owner);assert.equal(rows.length,0);
  return initial;
 }
 const before=source.replace('var item=all[i];if(item.inherits("DzBone"))continue;','var item=all[i];if(item.inherits("DzBone")||oSupport.isProtectedTransfer(item,main,config,nodes))continue;')
  .replace('if(same(parent,main)&&!oSupport.isProtectedTransfer(item,main,config,nodes))result.push(item);','if(same(parent,main))result.push(item);');
 measurements.menuProtectionCalls={before:measure(before),after:measure(source),nestedItems:80};assert.equal(measurements.menuProtectionCalls.before,81);assert.equal(measurements.menuProtectionCalls.after,1);
});
test('shipped icon-map keys and literal image paths resolve',()=>{
 const images=fs.readdirSync(path.join(root,'Resources')).concat(fs.readdirSync(path.join(root,'Default Items'))).map(n=>n.toLowerCase());
 const map=JSON.parse(fs.readFileSync(path.join(root,'Resources/Wearable Manager.json'),'utf8'));
 for(const group of [map.NamedIcons,map.InharitanceIcons])for(const n of Object.keys(group))assert(images.includes(n.replace(/^2-/,'').toLowerCase()+'.png'),n);
 const scripts=[...fs.readdirSync(root).filter(n=>n.endsWith('.dsa')),...fs.readdirSync(path.join(root,'Resources')).filter(n=>n.endsWith('.dsa')).map(n=>'Resources/'+n)];
 for(const p of scripts){const text=fs.readFileSync(path.join(root,p),'utf8');new vm.Script(text,{filename:p});
  for(const m of text.matchAll(/["'](Wearable Manager[^"'\r\n]*\.png)["']/gi))assert(images.includes(m[1].toLowerCase()),p+': '+m[1]);
 }
});
test('both resource readers route every shipped PNG and saved alias to its actual split directory',()=>{
 for(const text of [source,wardrobe]){const resolve=vm.runInNewContext('('+getFunction(text,'WM2ResourceName').text+')');const dir={exists:n=>fs.existsSync(path.join(root,'Resources',n))};
  for(const folder of ['Resources','Default Items'])for(const name of fs.readdirSync(path.join(root,folder)).filter(n=>n.endsWith('.png'))){const resolved=resolve(dir,name);assert(fs.existsSync(path.join(root,'Resources',resolved)),name);if(folder==='Default Items')assert.equal(resolved,'../Default Items/'+name);}
  assert.equal(resolve(dir,'Wearables Manager - Hat.png'),'../Default Items/Wearable Manager - Hat.png');
  assert.equal(resolve(dir,'Wardrobe Sets Travel.png'),'../Default Items/Wearable Manager Wardrobe Sets Travel.png');
  assert.equal(resolve(dir,'Wearable Manager.json'),'Wearable Manager.json');
 }
});

test('all distributable and development filenames use the product prefix',()=>{
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith('.')||e.name==='WM2 Settings.json')continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else assert(e.name.startsWith('Wearable Manager'),p);}}
 walk(root);
});
console.log(JSON.stringify({passed,failed:0,nativeDAZ:false,measurements},null,2));
