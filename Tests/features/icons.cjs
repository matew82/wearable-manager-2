// Pure/source-extracted tests. No native DAZ, product writes or external uploads.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const propose=()=>{throw Error('Packaged tests require actual integrated source.');};
let root=path.resolve(__dirname,'../..'),supportPath=path.join(root,'Resources/WM2 Support.dsa'),integrated=true;
for(let i=2;i<process.argv.length;i++){const a=process.argv[i];if(a==='--source-root')root=path.resolve(process.argv[++i]);else if(a==='--support-source')supportPath=path.resolve(process.argv[++i]);else if(a==='--integrated')integrated=true;else throw Error('Usage: node run-tests.cjs [--source-root <Full/Menu folder>] [--support-source <WM2 Support source>] [--integrated]');}
const body='';
const supportSource=supportPath?fs.readFileSync(supportPath,'utf8'):'var WM2Support = {\n'+body+'\n};';
const context={};vm.createContext(context);vm.runInContext(supportSource,context);const support=context.WM2Support;
assert(support&&typeof support.matchIcon==='function'&&typeof support.previewIconRules==='function','Actual matcher/preview exports missing');
const cases=[],maps={},sourceInventory=[];
const plain=x=>JSON.parse(JSON.stringify(x));
function test(name,fn){fn();cases.push({name,result:'PASS'});}
function rule(kind,pattern,icon='chosen.png'){return {kind,pattern,icon};}
function node(name,label){return {name,getLabel:()=>label,className:()=> 'DzBasicCamera'};}
const none={matched:false,icon:null,ruleIndex:-1,kind:null,pattern:null};
for(const [input,expected]of [
  ['Hair (1)','Hair'],['Hair (2)','Hair'],['Hair (001)','Hair'],['Hair  (1)','Hair '],[' Hair (1)',' Hair'],['Hair (1) ','Hair (1) '],
  ['Hair(1)','Hair(1)'],['Hair\t(1)','Hair\t(1)'],['Hair (v1)','Hair (v1)'],['Hair (-1)','Hair (-1)'],['Hair (1.5)','Hair (1.5)'],
  ['Hair (１)','Hair (１)'],['Hair (1) Extra','Hair (1) Extra'],['Hair (1) (2)','Hair (1)'],['髪 🎨 (2)','髪 🎨'],['','']
])test('normalize exact terminal suffix: '+JSON.stringify(input),()=>assert.equal(support.normalizeCopyLabel(input),expected));
test('Invalid label input is safe and not coerced',()=>{assert.equal(support.normalizeCopyLabel(null),'');assert.equal(support.normalizeCopyLabel(123),'');});
test('Exact name beats exact label and both prefixes regardless of rule order',()=>{const rules=[rule('labelPrefix','Hair','lp.png'),rule('namePrefix','Base','np.png'),rule('exactLabel','Hair','el.png'),rule('exactName','BaseHair','en.png')];assert.deepStrictEqual(plain(support.matchIcon(rules,node('BaseHair','Hair (2)'))),{matched:true,icon:'en.png',ruleIndex:3,kind:'exactName',pattern:'BaseHair'});});
test('Exact label beats a longer matching name prefix',()=>{const rules=[rule('namePrefix','VeryLong','np.png'),rule('exactLabel','Hair','el.png')];assert.equal(support.matchIcon(rules,node('VeryLongName','Hair (1)')).icon,'el.png');});
test('Exact label normalizes both label and stored pattern',()=>{const result=support.matchIcon([rule('exactLabel','Hair (2)')],node('Name','Hair (1)'));assert.equal(result.matched,true);assert.equal(result.pattern,'Hair (2)');});
test('Exact name never strips its numbered suffix',()=>assert.deepStrictEqual(plain(support.matchIcon([rule('exactName','Hair')],node('Hair (1)','Other'))),none));
test('Exact names retain literal copy suffix patterns',()=>assert.equal(support.matchIcon([rule('exactName','Hair (1)')],node('Hair (1)','Other')).matched,true));
test('Label prefix uses original label, including numbered suffix',()=>{const rules=[rule('labelPrefix','Hair (2)')];assert.equal(support.matchIcon(rules,node('Name','Hair (2) Tail')).matched,true);assert.equal(support.matchIcon(rules,node('Name','Hair (1) Tail')).matched,false);});
test('Label prefix pattern is not normalized',()=>assert.equal(support.matchIcon([rule('labelPrefix','Hair (2)')],node('Name','Hair')).matched,false));
test('Name prefix uses original name, including suffix',()=>assert.equal(support.matchIcon([rule('namePrefix','Hair (1)')],node('Hair (1) Tail','Other')).matched,true));
test('Longest name prefix beats shorter label prefix',()=>{const rules=[rule('labelPrefix','Hair','lp.png'),rule('namePrefix','HairLong','np.png')];assert.equal(support.matchIcon(rules,node('HairLongNode','HairLabel')).icon,'np.png');});
test('Longest label prefix beats shorter name prefix',()=>{const rules=[rule('namePrefix','Hair','np.png'),rule('labelPrefix','HairLong','lp.png')];assert.equal(support.matchIcon(rules,node('HairNode','HairLongLabel')).icon,'lp.png');});
test('Equal prefix lengths prefer label before name regardless of order',()=>{const rules=[rule('namePrefix','Hair','np.png'),rule('labelPrefix','Coat','lp.png')];assert.equal(support.matchIcon(rules,node('HairNode','CoatLabel')).icon,'lp.png');});
test('Earlier matching exact rule wins final tie',()=>assert.equal(support.matchIcon([rule('exactLabel','Hair','one.png'),rule('exactLabel','Hair (1)','two.png')],node('Name','Hair (2)')).ruleIndex,0));
test('Earlier matching same-kind prefix wins final tie',()=>assert.equal(support.matchIcon([rule('labelPrefix','Hair','one.png'),rule('labelPrefix','Hair','two.png')],node('Name','HairLong')).ruleIndex,0));
test('Icon rules ignore letter case consistently',()=>{assert.equal(support.matchIcon([rule('exactName','hair'),rule('labelPrefix','hair')],node('Hair','Hair')).matched,true);});
test('Unicode labels match literal suffix-aware exact text',()=>assert.equal(support.matchIcon([rule('exactLabel','髪 🎨')],node('Name','髪 🎨 (7)')).matched,true));
test('Prefix metacharacters are literal, never regex or wildcard',()=>{assert.equal(support.matchIcon([rule('labelPrefix','Hair.*')],node('Name','Hair.* Long')).matched,true);assert.equal(support.matchIcon([rule('labelPrefix','Hair.*')],node('Name','Hair Long')).matched,false);});
test('Exact metacharacters remain literal',()=>assert.equal(support.matchIcon([rule('exactLabel','[Hair]+?')],node('Name','[Hair]+? (1)')).matched,true));
test('Malformed and empty rules are skipped, retaining original index',()=>{const rules=[null,{},rule('unknown','Hair'),rule('exactName',''),{kind:'exactName',pattern:'Hair',icon:''},rule('exactName','Hair')];assert.equal(support.matchIcon(rules,node('Hair','Other')).ruleIndex,5);});
test('Normalized empty base does not match unlabeled nodes',()=>assert.equal(support.matchIcon([rule('exactLabel',' (1)')],node('Name','')).matched,false));
test('Missing node and rules are unmatched',()=>{assert.deepStrictEqual(plain(support.matchIcon([],null)),none);assert.deepStrictEqual(plain(support.matchIcon(null,node('Hair','Hair'))),none);});
test('objectName alias works without normalizing object name',()=>{const n={objectName:'Hair (1)',getLabel:()=> 'Other'};assert.equal(support.matchIcon([rule('exactName','Hair (1)')],n).matched,true);assert.equal(support.matchIcon([rule('exactName','Hair')],n).matched,false);});
test('Documented method/name access fallbacks remain literal',()=>{assert.equal(support.matchIcon([rule('exactName','Hair')],{getName:()=> 'Hair',label:'Other'}).matched,true);assert.equal(support.matchIcon([rule('exactName','Hair')],{objectName:()=> 'Hair',label:'Other'}).matched,true);});
test('Stale getter errors are safe unmatched reads',()=>{assert.deepStrictEqual(plain(support.matchIcon([rule('exactName','Hair'),rule('exactLabel','Hair')],{getName(){throw Error('gone');},getLabel(){throw Error('gone');}})),none);});
test('Preview bounds rows/counts and leaves nodes unchanged',()=>{let reads=0;const n={name:'Hair',getLabel(){reads++;return 'Hair (1)';}},nodes=[n,n,n],result=plain(support.previewIconRules([rule('exactLabel','Hair')],nodes,2));assert.equal(result.scanned,2);assert.equal(result.matched,2);assert.equal(result.total,3);assert.equal(result.truncated,true);assert.equal(result.limit,2);assert.equal(result.rows[0].normalizedLabel,'Hair');assert.equal(n.name,'Hair');assert.equal(reads,2);});
test('Preview caps caller limit at 2000 and defaults to200',()=>{const nodes=Array.from({length:2001},()=>node('Name','Other'));assert.equal(support.previewIconRules([],nodes,9999).scanned,2000);assert.equal(support.previewIconRules([],nodes).scanned,200);assert.equal(support.previewIconRules([],nodes,0).scanned,0);assert.equal(support.previewIconRules([],nodes,-1).scanned,0);});
test('Empty preview has no truncation or match',()=>{const result=support.previewIconRules([],null);assert.equal(result.scanned,0);assert.equal(result.matched,0);assert.equal(result.truncated,false);});

function iconsClass(source,rules,files,withSupport=true,options={}){
  const writes=[],dirs=[];let closes=0,opens=0;
  let dirAttempts=0;
  function Dir(){dirAttempts++;if(options.throwRuleDir&&dirAttempts===2)throw Error('isolated rule directory constructor failure');dirs.push(this);this.filePath=name=>'/Resources/'+name;this.exists=name=>files.indexOf(name)>=0;this.deleteLater=()=>{this.deleted=true;};}
  function File(){this.open=mode=>{opens++;return options.shippedJson!==undefined;};this.read=()=>options.shippedJson;this.close=()=>{closes++;};this.write=value=>{writes.push(value);};}File.ReadOnly=1;File.WriteOnly=2;
  const c={PATH_ICONS:'/Resources',JSON_NAME:'Wearables Manager.json',ICONS_EXTENSION:'.PNG',DzDir:Dir,DzFile:File,Pixmap:function(p){if(p==='/Resources/custom.png'&&options.customPixmap==='throw')throw Error('isolated bad PNG constructor');this.path=p;this.width=p==='/Resources/custom.png'&&options.customPixmap==='zero'?0:24;this.height=24;},oWM2Config:{iconRules:rules}};
  if(options.noConfig)delete c.oWM2Config;
  vm.createContext(c);vm.runInContext('String.prototype.mid=function(start,count){return this.substr(start,count);};',c);vm.runInContext(supportSource,c);
  if(!withSupport)c.WM2Support.matchIcon=undefined;
  const start=source.indexOf('function WearablesIconsClass('),end=source.indexOf('function TagImageManagerClass(',start);assert(start>=0&&end>start);
  vm.runInContext(source.slice(start,end),c);return {icons:new c.WearablesIconsClass(),writes,dirs,get opens(){return opens;},get closes(){return closes;}};
}
for(const file of ['Wearables Manager Full.dsa','Wearables Manager Menu.dsa']) {
  const bytes=fs.readFileSync(path.join(root,file)),source=bytes.toString('utf8');sourceInventory.push({file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  const overlay=integrated?{source,operations:[]}:propose(source,file);maps[file]=overlay.operations;new vm.Script(overlay.source);
  test(file+': available user override wins before actual automatic mapping',()=>{const a=iconsClass(overlay.source,[rule('exactLabel','Hair','custom.png')],['custom.png']);assert.equal(a.icons.GetIconForWearable(node('Camera','Hair (1)')).path,'/Resources/custom.png');assert.equal(a.writes.length,0);assert(a.dirs.every(d=>d.deleted));});
  test(file+': missing configured PNG uses actual legacy automatic fallback',()=>{const a=iconsClass(overlay.source,[rule('exactLabel','Hair','missing.png')],[]);assert.equal(a.icons.GetIconForWearable(node('Camera','Hair (1)')).path,'/Resources/Wearables Manager - Camera.PNG');assert.equal(a.writes.length,0);assert(a.dirs.every(d=>d.deleted));});
  for(const mode of ['zero','throw'])test(file+': '+mode+' configured Pixmap uses actual automatic fallback and releases both directories',()=>{const a=iconsClass(overlay.source,[rule('exactLabel','Hair','custom.png')],['custom.png'],true,{customPixmap:mode});assert.equal(a.icons.GetIconForWearable(node('Camera','Hair (1)')).path,'/Resources/Wearables Manager - Camera.PNG');assert.equal(a.writes.length,0);assert(a.dirs.every(d=>d.deleted));});
  test(file+': throwing configured directory constructor uses actual automatic fallback',()=>{const a=iconsClass(overlay.source,[rule('exactLabel','Hair','custom.png')],['custom.png'],true,{throwRuleDir:true});assert.equal(a.icons.GetIconForWearable(node('Camera','Hair (1)')).path,'/Resources/Wearables Manager - Camera.PNG');assert(a.dirs.every(d=>d.deleted));});
  test(file+': unmatched rules retain actual automatic fallback',()=>{const a=iconsClass(overlay.source,[rule('exactName','Different','custom.png')],['custom.png']);assert.equal(a.icons.GetIconForWearable(node('Camera','Hair')).path,'/Resources/Wearables Manager - Camera.PNG');assert.equal(a.writes.length,0);});
  test(file+': absent optional matcher retains actual automatic fallback',()=>{const a=iconsClass(overlay.source,[rule('exactLabel','Hair','custom.png')],['custom.png'],false);assert.equal(a.icons.GetIconForWearable(node('Camera','Hair')).path,'/Resources/Wearables Manager - Camera.PNG');assert.equal(a.writes.length,0);});
  test(file+': absent optional configuration retains actual automatic fallback',()=>{const a=iconsClass(overlay.source,[],[],true,{noConfig:true});assert.equal(a.icons.GetIconForWearable(node('Camera','Hair')).path,'/Resources/Wearables Manager - Camera.PNG');});
  test(file+': validated shipped JSON custom mapping still loads without saving',()=>{
    const shippedJson=JSON.stringify({InharitanceIcons:{'Custom Camera':'DzBasicCamera'},NamedIcons:{}}),a=iconsClass(overlay.source,[],[],true,{shippedJson});assert.equal(a.icons.GetIconForWearable(node('Camera','Hair')).path,'/Resources/Custom Camera.PNG');assert.equal(a.opens,1);assert.equal(a.closes,1);assert.equal(a.writes.length,0);
    if(!integrated){const untouchedSource=source.slice(source.indexOf('function WearablesIconsClass('),source.indexOf('function TagImageManagerClass('));let changed=overlay.source.slice(overlay.source.indexOf('function WearablesIconsClass('),overlay.source.indexOf('function TagImageManagerClass('));for(const op of overlay.operations.slice().reverse())changed=changed.replace(op.newText,op.oldText);assert.equal(changed,untouchedSource);}
  });
  const baseline=fs.readFileSync(path.join(root,'.test-output/baseline',file),'utf8');
  for(const [type,name,label] of [
    ['DzNode','10in1CW_SlitSkirt_4576','10in1 Casual Wardrobe Slit Skirt'],
    ['DzGeometryShellNode','Hair','Other'],
    ['DzPointLight','Unknown','Bottle'],
    ['DzDForceWindNode','Shirt','Shirt'],
    ['DzNode','Unknown','Completely Unknown'],
    ['DzNode','Shirt','Dress'],
    ['DzNode','BlueHat','Blue Hat'],
    ['DzNode','DenimDress','Denim Dress']
  ])test(file+': shared built-in icon preserves baseline precedence for '+type+' '+name,()=>{
    const n=node(name,label);n.className=()=>type;
    const old=iconsClass(baseline,[],[]),current=iconsClass(overlay.source,[],[]);
    assert.equal(current.icons.GetIconForWearable(n).path,old.icons.GetIconForWearable(n).path);
    assert.equal(current.writes.length,0);assert(current.dirs.every(d=>d.deleted));
  });
}

// Word matching and retained legacy semantics use the actual shared module.
for(const kind of ['nameWord','labelWord']) {
  const item=value=>kind==='nameWord'?node(value,'Other'):node('Other',value);
  const matches=value=>support.matchIcon([rule(kind,'Duvet')],item(value)).matched;
  test(kind+': user examples and two required boundaries',()=>{
    for(const value of ['Duvet','dForce Duvet','Duvet2','2Duvet','Duvet_cover','!Duvet!'])assert.equal(matches(value),true,value);
    for(const value of ['DuvetCover','CoverDuvet','CoverDuvetCover',' DuvetCover','CoverDuvet '])assert.equal(matches(value),false,value);
  });
  for(const boundary of [' ','\t','\r','\n','\v','\f','\u00a0','\u2028','\u2029','-','_','!','\u2010','\u2011','\u2012','\u2013','\u2014','\u2015',...'0123456789']) {
    const separator=boundary;
    test(kind+': boundary '+JSON.stringify(separator)+' is allowed independently on each edge',()=>{
      for(const value of [separator+'Duvet','Duvet'+separator,separator+'Duvet'+separator])assert.equal(matches(value),true,JSON.stringify(value));
      assert.equal(matches('xDuvet'+separator),false);assert.equal(matches(separator+'Duvetx'),false);
    });
  }
  test(kind+': unlisted punctuation and letters are not boundaries',()=>{
    for(const separator of ['x','X','\u00e9','\u4e2d','.',',',':',';','/','\\','(',')','[',']','+','?','@']){
      assert.equal(matches(separator+'Duvet'),false,separator+'Duvet');assert.equal(matches('Duvet'+separator),false,'Duvet'+separator);
    }
  });
  test(kind+': scans past an embedded first occurrence and supports overlaps',()=>{
    assert(matches('CoverDuvet Duvet!'));assert(matches('DuvetCover !Duvet'));assert(!matches('CoverDuvet DuvetCover'));
    assert(support.matchIcon([rule(kind,'a-a')],item('Xa-a-a')).matched);
  });
  test(kind+': case and whitespace stay literal',()=>{
    assert.equal(matches('duvet'),true);assert.equal(support.matchIcon([rule(kind,' Duvet ')],item('! Duvet !')).matched,true);
    assert.equal(support.matchIcon([rule(kind,' Duvet ')],item('Duvet')).matched,false);
    assert.equal(support.matchIcon([rule(kind,'Duvet cover')],item('!Duvet cover!')).matched,true);
  });
  test(kind+': regex metacharacters and backslashes are literal text',()=>{
    for(const pattern of ['Duvet.*','[Duvet]','(Duvet)','Duvet+?','^Duvet$','Duvet|Cover','Duvet\\Cover','.*','[]()+*?^$|.\\']){
      assert(support.matchIcon([rule(kind,pattern)],item('!'+pattern+'!')).matched,pattern);
      assert.equal(support.matchIcon([rule(kind,pattern)],item('DuvetCover')).matched,false,pattern);
    }
  });
  test(kind+': only its selected field participates',()=>{
    assert.equal(support.matchIcon([rule(kind,'Duvet')],kind==='nameWord'?node('Other','Duvet'):node('Duvet','Other')).matched,false);
  });
}
test('word helper refuses empty/non-string values and does not coerce objects',()=>{
  for(const [value,pattern]of [[null,'Duvet'],['Duvet',null],[123,'Duvet'],['Duvet',123],['Duvet',''],[{toString(){throw Error('coerced');}},'Duvet']])assert.equal(support.containsIconWord(value,pattern),false);
});
test('exact name then exact label outrank matching words regardless of order',()=>{
  const rules=[rule('labelWord','Duvet','lw.png'),rule('nameWord','Duvet','nw.png'),rule('exactLabel','dForce Duvet','el.png'),rule('exactName','Duvet','en.png')];
  assert.equal(support.matchIcon(rules,node('Duvet','dForce Duvet (2)')).icon,'en.png');
  assert.equal(support.matchIcon(rules.slice(0,3),node('Duvet','dForce Duvet (2)')).icon,'el.png');
});
test('longer word patterns win across name/label fields',()=>{
  assert.equal(support.matchIcon([rule('labelWord','Coat','short.png'),rule('nameWord','Long Coat','long.png')],node('Long Coat','Coat')).icon,'long.png');
  assert.equal(support.matchIcon([rule('nameWord','Coat','short.png'),rule('labelWord','Long Coat','long.png')],node('Coat','Long Coat')).icon,'long.png');
});
test('equal word lengths prefer label before name in either row order',()=>{
  const rules=[rule('nameWord','Duvet','name.png'),rule('labelWord','Cover','label.png')];
  for(const rows of [rules,rules.slice().reverse()])assert.equal(support.matchIcon(rows,node('Duvet','Cover')).icon,'label.png');
});
test('same-field equal-length word ties keep the earlier row',()=>{
  const rules=[rule('labelWord','Duvet','one.png'),rule('labelWord','Cover','two.png')];
  assert.equal(support.matchIcon(rules,node('Other','Duvet Cover')).icon,'one.png');
  assert.equal(support.matchIcon(rules.slice().reverse(),node('Other','Duvet Cover')).icon,'two.png');
});
test('word rules outrank legacy prefixes without changing prefix-only behavior',()=>{
  const legacy=[rule('namePrefix','DuvetLong','name.png'),rule('labelPrefix','dForce Duvet','label.png')],n=node('DuvetLongCover','dForce Duvet');
  assert.equal(support.matchIcon(legacy,n).icon,'label.png');
  for(const rows of [legacy.concat(rule('labelWord','Duvet','word.png')),[rule('labelWord','Duvet','word.png')].concat(legacy)])assert.equal(support.matchIcon(rows,n).icon,'word.png');
  assert.equal(support.matchIcon([rule('labelPrefix','Duvet')],node('Other','DuvetCover')).matched,true);
  assert.equal(support.matchIcon([rule('labelWord','Duvet')],node('Other','DuvetCover')).matched,false);
});
test('word labels preserve suffix literals while exact-label normalization remains unchanged',()=>{
  const n=node('Other','Hair (1)');assert.equal(support.matchIcon([rule('labelWord','Hair (2)')],n).matched,false);
  assert.equal(support.matchIcon([rule('labelWord','Hair')],n).matched,true);
  assert.equal(support.matchIcon([rule('exactLabel','Hair (2)')],n).matched,true);
  assert.equal(support.matchIcon([rule('labelWord','Hair')],node('Other','(Hair)')).matched,false);
});
test('word preview matches the runtime result and leaves the node unchanged',()=>{
  const n=node('dForce Duvet','!Duvet!'),rules=[rule('nameWord','Duvet'),rule('labelWord','Duvet')],before=n.name,result=support.previewIconRules(rules,[n],10);
  assert.deepStrictEqual(plain(result.rows[0].match),plain(support.matchIcon(rules,n)));assert.equal(n.name,before);assert.equal(result.matched,1);
});
for(const file of ['Wearables Manager Full.dsa','Wearables Manager Menu.dsa'])test(file+': shared word matcher selects configured PNG; embedded letters retain automatic icon',()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8'),a=iconsClass(source,[rule('labelWord','Duvet','custom.png')],['custom.png']);
  assert.equal(a.icons.GetIconForWearable(node('Camera','dForce Duvet')).path,'/Resources/custom.png');
  assert.equal(a.icons.GetIconForWearable(node('Camera','DuvetCover')).path,'/Resources/Wearables Manager - Camera.PNG');assert.equal(a.writes.length,0);
});

for(const kind of ['exactName','exactLabel','nameWord','labelWord','namePrefix','labelPrefix'])test(kind+': preview/runtime case variants agree and preserve original spelling',()=>{
  const rules=[rule(kind,'DuVeT')],n=node('duvet','DUVET (2)'),result=support.matchIcon(rules,n),preview=support.previewIconRules(rules,{0:n,length:1},10);
  assert(result.matched);assert.equal(result.pattern,'DuVeT');assert.deepStrictEqual(plain(preview.rows[0].match),plain(result));assert.equal(preview.rows[0].label,'DUVET (2)');
});
test('indexed DAZ-like collections preview actual entries instead of becoming empty',()=>{const n=node('Hat','Hat'),host={0:n,length:1};assert.equal(Array.isArray(host),false);const p=support.previewIconRules([rule('exactName','hat')],host);assert.equal(p.scanned,1);assert.equal(p.total,1);assert.equal(p.matched,1);});
test('host enumeration prefers count/index APIs and bounds getters',()=>{let reads=0;const scene={getNumNodes:()=>2100,getNode(i){reads++;return node('Node'+i,'Hat');},getNodeList(){throw Error('must not use branded list');}};const nodes=support.iconSceneNodes(scene,false,2000);assert(nodes.ok);assert.equal(nodes.nodes.length,2000);assert.equal(nodes.total,2100);assert.equal(reads,2000);});
test('host list fallback uses only length/index rather than Array/filter/iterator methods',()=>{const n=node('Hat','Hat'),host={0:n,length:1,filter(){throw Error('no filter');},slice(){throw Error('no slice');}},p=support.iconSceneNodes({getNodeList:()=>host},false,10);assert(p.ok);assert.equal(p.total,1);assert.equal(support.previewIconRules([rule('labelWord','HAT')],p.nodes).matched,1);});
test('invalid collection and Scene errors are reported instead of showing an empty scene',()=>{for(const nodes of [{}, {length:-1},{length:'1'},{length:Infinity},{length:1.5}])assert.equal(support.previewIconRules([],nodes).ok,false);assert.equal(support.iconSceneNodes({getNumNodes(){throw Error('gone');},getNode(){}},false).ok,false);assert.equal(support.iconSceneNodes({getNodeList:()=>null},false).ok,false);});
test('single selection never silently reduces a multiple host selection to its first node',()=>{const one=node('Duvet','Visible'),two=node('Hat','Hat');assert.equal(support.iconSelection({getSelectedNodeList:()=>({0:one,1:two,length:2})}).ok,false);const selected=support.iconSelection({getNumSelectedNodes:()=>1,getSelectedNode:()=>one});assert(selected.ok);assert.equal(selected.node,one);assert.equal(support.iconSelection({getSelectedNodeList:()=>[]}).ok,false);});
test('fitted/parented props remain eligible icon targets; main-owner rules are not used',()=>{const prop={...node('Hat','Hat'),inherits:type=>type==='DzNode',getNodeParent:()=>({}),getFollowTarget:()=>({})};assert(support.isIconNode(prop));assert.equal(support.isIconNode({...prop,inherits:type=>['DzNode','DzBone'].includes(type)}),false);});
test('case-equivalent exact matches keep deterministic earlier-row priority',()=>{const rows=[rule('exactLabel','Duvet','one.png'),rule('exactLabel','DUVET','two.png')];assert.equal(support.matchIcon(rows,node('Other','duvet (1)')).icon,'one.png');});

const result={status:integrated?'Actual integrated source':'Pure methods and UNAPPLIED actual-source integration overlay',nativeExecuted:false,productSourcesWritten:false,sourceRoot:root,supportSource:supportPath||'wm2-icon-methods.body.js',sourceInventory,cases,passed:cases.length};
fs.writeFileSync(path.join(root,'.test-output/features-icons.json'),JSON.stringify(result,null,2)+'\n');

console.log(JSON.stringify({passed:cases.length,nativeExecuted:false,status:result.status},null,2));
