'use strict';
// Actual shared matcher, settings and UI sources; isolated Scene/file/widget mocks.
// No DAZ, preference writes, receipt files or scene selection changes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const args=process.argv.slice(2);
if(args.length&&(args.length!==2||args[0]!=='--source-root'))throw Error('Usage: node Tests/features/asset-icons.cjs [--source-root <product-root>]');
const root=path.resolve(args.length?args[1]:path.join(__dirname,'../..')),featureDirectory=path.join(root,'Tests/features');
const sourcePaths={support:path.join(root,'Resources/WM2 Support.dsa'),ui:path.join(root,'Resources/WM2 Settings UI.dsa')};
const {getFunction}=require('../support/extract.cjs');
const baselineMenuPath=path.join(root,'.test-output/baseline/Wearables Manager Menu.dsa');
const snapshots=new Map(Object.values(sourcePaths).map(file=>[path.resolve(file),fs.readFileSync(file,'utf8')]));
const readOnlyFS={readFileSync(file,encoding){const text=snapshots.get(path.resolve(file));return text===undefined?fs.readFileSync(file,encoding):encoding?text:Buffer.from(text);}};
function controlledRequire(name){if(name==='fs'||name==='node:fs')return readOnlyFS;if(!['path','node:path','vm','node:vm','assert','node:assert','crypto','node:crypto'].includes(name))throw Error('Unexpected helper dependency '+name);return require(name);}
function prefixExports(file,marker,exportsText,argv){
 const filename=path.join(featureDirectory,file),text=fs.readFileSync(filename,'utf8'),stop=text.indexOf(marker);assert(stop>0,'Missing bounded helper prefix '+file);
 const context=vm.createContext({require:controlledRequire,__dirname:featureDirectory,__filename:filename,Buffer,console,module:{exports:{}},process:{argv:argv||[]}});
 vm.runInContext(text.slice(0,stop)+'\nmodule.exports='+exportsText+';',context,{filename});return context.module.exports;
}
const ui=prefixExports('ui.cjs',"test('ES5",'{environment}',[]);
const io=prefixExports('config.cjs','\nconst tests=[];','{fixture,RESOURCE,TARGET,LEGACY}',['node','asset-icons',sourcePaths.support]);
const plain=value=>JSON.parse(JSON.stringify(value)),tests=[];
function test(name,run){try{run();tests.push({name,pass:true});}catch(error){tests.push({name,pass:false,message:String(error),stack:error.stack});}}
const rule=(kind,pattern,icon='A.png')=>({kind,pattern,icon});
function config(rules=[]){const value=plain(io.fixture().support.defaults());value.iconRules=rules;return value;}
let serial=100;
function node(name='ItemInternal',label='Visible Item',asset='/data/Vendor/Items/Item.dsf#Item'){
 return {name,elementID:String(serial++),label,asset,assetId:asset,parent:null,children:[],type:'DzNode',getName(){return this.name;},getLabel(){return this.label;},
  className(){return this.type;},inherits(kind){return kind==='DzNode'||kind===this.type||kind==='DzSkeleton'&&this.type==='DzFigure';},
  getAssetId(){return this.asset;},getNodeParent(){return this.parent;},getNodeChildren(recursive){if(!recursive)return this.children;const result=[],seen=new Set();const visit=n=>{for(const child of n.children){if(seen.has(child))continue;seen.add(child);result.push(child);visit(child);}};visit(this);return result;},
  getFollowTarget(){return this.follow||null;},getNumGraftFigures(){return 0;},getGraftFigure(){return null;},findDataItem(){return null;},
  setSelected(){throw Error('Forbidden Scene selection');},addNodeChild(){throw Error('Forbidden reparent');},setFollowTarget(){throw Error('Forbidden FitTo');}};
}
function environment(selected=node(),rules=[],nodes=[selected],options={}){return ui.environment({config:config(rules),selected,nodes,...options});}
function match(rules,item=node()){const e=environment(item,rules);const result=e.support.matchIcon(rules,item);assert.equal(e.g.sceneWrites,0);return result;}
function noWrites(e){assert.equal(e.g.sceneWrites,0);assert.equal(e.g.signalStack.length,0);assert.equal(e.g.destructiveReplacements.length,0);assert.equal(e.g.activeSenderDisposals.length,0);assert.equal(e.g.scrollAttachments.filter(row=>row.insideSignal).length,0);}
function last(e,kind){const rows=e.g.widgets.filter(w=>w.kind===kind&&!w.deleted);assert(rows.length,'Missing '+kind);return rows[rows.length-1];}
function dialog(e){return e.context.WM2ShowIconRules('C:/scratch/Resources');}
function figureWorld(rules=[]){
 const figure=node('Genesis9','Main Figure','/data/Genesis9.dsf#Genesis9');figure.type='DzFigure';
 const a=node('ItemA','Alpha','/data/Vendor/ItemA.dsf#ItemA'),b=node('ItemB','Beta','/data/Vendor/ItemB.dsf#ItemB');
 a.parent=b.parent=figure;figure.children=[a,b];
 const e=environment(a,rules,[figure,a,b]);return {e,figure,a,b};
}
function inside(widget,ancestor){for(let current=widget;current;current=current.parent)if(current===ancestor)return true;return false;}
function tile(e,target){const body=e.one('DzScrollArea').widget,buttons=e.g.widgets.filter(w=>w.kind==='DzPushButton'&&inside(w,body)&&w.wm2EditingNode&&w.wm2EditingNode.elementID===target.elementID);assert.equal(buttons.length,1,'One current preview tile for '+target.name);return buttons[0];}
function clickTile(e,target){const button=tile(e,target),callbacks=button.signals['clicked()']||[];assert.equal(callbacks.length,1,'Tile has one editing signal');e.emit(button,'clicked()');}
function caption(e,target){assert.equal(e.one('DzBasicDialog').caption,'Icon rules for '+target.label+' ['+target.name+']');const headings=e.g.widgets.filter(w=>w.kind==='DzLabel'&&w.text===e.one('DzBasicDialog').caption);assert.equal(headings.length,1);assert(headings[0].font.bold);assert(headings[0].font.pointSize>=16);}
function metadataNode(filePath='/data/Vendor/Product/ItemKey/Name.dsf',author='',raw='RawDifferentId'){
 const n=node('RenamedInternal','Copied Label (3)',raw);n.assetUri={filePath};n.assetAuthor={toString:()=>author};return n;
}
function actualFunction(text,name){
 // Delegate declarations and closing braces have different indentation in the
 // actual engines. Extract the complete bounded delegate, not the class brace.
 const delegate=new RegExp('^[ \\t]*function '+name+'\\(oWearable\\)\\s*\\{\\s*return WM2Support\\.wearableAssetInfo\\(oWearable\\)\\.caption;\\s*\\}','m').exec(text);
 assert(delegate,'Missing actual shared caption delegate '+name);
 return delegate[0];
}
let baselineCaption;
function originalCaption(n){
 if(!baselineCaption){assert(fs.existsSync(baselineMenuPath),'Actual original Menu baseline is required: '+baselineMenuPath);const text=fs.readFileSync(baselineMenuPath,'utf8');baselineCaption=vm.runInNewContext(getFunction(text,'GetWearableItemAuthorString').text+'\nGetWearableItemAuthorString;');}
 return baselineCaption(n);
}
function backButton(e){const body=e.one('DzScrollArea').widget,buttons=e.g.widgets.filter(w=>w.kind==='DzPushButton'&&inside(w,body)&&w.wm2OwnerNode);assert.equal(buttons.length,1,'One current owner navigation button');assert.equal(buttons[0].text,'Back to '+buttons[0].wm2OwnerNode.getLabel());return buttons[0];}
function clickBack(e){const button=backButton(e),callbacks=button.signals['clicked()']||[];assert.equal(callbacks.length,1);e.emit(button,'clicked()');}
function wholeOwner(e,child){clickBack(e);assert.equal(e.preview().wholeFigure,true);clickTile(e,child);assert.equal(e.preview().wholeFigure,true);assert.equal(e.preview().activeNode.elementID,child.elementID);}

test('actual asset kinds validate without changing unrelated configuration',()=>{const f=io.fixture(),value=config([rule('exactAssetId','/data/Vendor/Item.dsf#Item'),rule('assetIdWord','Item')]),before=plain(value),result=f.support.validate(value);assert(result.ok,result.message);assert.deepEqual(plain(result.config),before);assert.deepEqual(value,before);});
test('asset kinds round-trip Unicode URIs and literal words in the separate settings file',()=>{const f=io.fixture(),value=config([rule('exactAssetId','/data/供应商/Armour%20Set/Helmet.dsf#Helmet'),rule('assetIdWord','helmet_long')]),loaded=f.support.load(io.RESOURCE),legacy=f.files.get(io.LEGACY).raw;assert(f.support.save(io.RESOURCE,value,loaded.rawToken).ok);assert.deepEqual(plain(f.support.load(io.RESOURCE).config),value);assert.equal(f.files.get(io.LEGACY).raw,legacy);});
test('unknown kind still fails validation rather than becoming executable matching code',()=>{const f=io.fixture(),value=config([rule('assetRegex','.*')]);assert.equal(f.support.validate(value).ok,false);});
test('exact asset match compares the complete URI case-insensitively',()=>{const uri='/data/Vendor/Outfit/Coat.dsf#Coat',n=node('Renamed','Changed label',uri);assert.equal(match([rule('exactAssetId',uri.toUpperCase())],n).matched,true);assert.equal(match([rule('exactAssetId','Coat')],n).matched,false);assert.equal(match([rule('exactAssetId',uri+'More')],n).matched,false);});
test('asset URI is not decoded or normalized as a label copy suffix',()=>{const n=node('Item','Item (3)','/data/Vendor/Item%20Name.dsf#Item (3)');assert.equal(match([rule('exactAssetId','/data/Vendor/Item Name.dsf#Item (3)')],n).matched,false);assert.equal(match([rule('exactAssetId','/data/Vendor/Item%20Name.dsf#Item')],n).matched,false);assert.equal(match([rule('exactAssetId',n.asset)],n).matched,true);});
for(const separator of [' ','\t','0','9','-','_','!','\u2013','\u2014'])test('asset word retains established separator '+JSON.stringify(separator),()=>{assert.equal(match([rule('assetIdWord','token')],node('X','Y','prefix'+separator+'TOKEN'+separator+'suffix')).matched,true);});
for(const separator of ['/','#',':','.','%'])test('asset URI punctuation is not an invented word boundary '+separator,()=>{assert.equal(match([rule('assetIdWord','token')],node('X','Y','prefix'+separator+'TOKEN'+separator+'suffix')).matched,false);});
test('asset word respects string edges and rejects embedded substrings',()=>{assert.equal(match([rule('assetIdWord','token')],node('X','Y','TOKEN')).matched,true);assert.equal(match([rule('assetIdWord','token')],node('X','Y','preTOKENsuffix')).matched,false);});
test('missing assetId never falls back to getter, elementID, name, label or arbitrary asset field',()=>{const n=node('pretendAsset','pretendAsset','pretendAsset');delete n.assetId;n.elementID='pretendAsset';n.assetUri={toString:()=> 'pretendAsset'};assert.equal(match([rule('exactAssetId','pretendAsset'),rule('assetIdWord','pretendAsset')],n).matched,false);});
test('empty and throwing assetId reads do not prevent ordinary name matching',()=>{const n=node('Ordinary','Label','');assert.equal(match([rule('exactAssetId','Anything')],n).matched,false);Object.defineProperty(n,'assetId',{get(){throw Error('Unavailable asset');}});assert.equal(match([rule('assetIdWord','Anything'),rule('exactName','Ordinary')],n).kind,'exactName');});
test('DzUri-style and nonstring assetId values are rejected without coercion',()=>{for(const value of [{toString:()=> '/data/Item.dsf#Item'},42,true,null,undefined])assert.equal(match([rule('exactAssetId','/data/Item.dsf#Item'),rule('exactAssetId',String(value))],node('X','Y',value)).matched,false);});
test('matcher reads the canonical string property once and never invokes getAssetId',()=>{const n=node('X','Y','canonical'),e=environment(n);let reads=0;Object.defineProperty(n,'assetId',{get(){reads++;return 'canonical';}});n.getAssetId=()=>{throw Error('Undocumented getter must not run');};assert.equal(e.support.matchIcon([rule('exactAssetId','CANONICAL')],n).matched,true);assert.equal(reads,1);noWrites(e);});
test('asset patterns allow 2,048 characters while ordinary patterns retain 256 limit',()=>{const f=io.fixture();for(const kind of ['exactAssetId','assetIdWord']){assert(f.support.validate(config([rule(kind,'x'.repeat(2048))])).ok);assert.equal(f.support.validate(config([rule(kind,'x'.repeat(2049))])).ok,false);}assert.equal(f.support.validate(config([rule('exactName','x'.repeat(257))])).ok,false);});
test('exact name wins before exact label and exact asset regardless of rule order',()=>{const n=node('Internal','Visible (2)','/data/Item.dsf#Item'),rules=[rule('exactAssetId',n.asset,'B.PNG'),rule('exactLabel','Visible','B.PNG'),rule('exactName','Internal')];assert.equal(match(rules,n).kind,'exactName');rules.pop();assert.equal(match(rules,n).kind,'exactLabel');rules.splice(1,1);assert.equal(match(rules,n).kind,'exactAssetId');});
test('exact asset wins before longer word rules and legacy prefixes',()=>{const n=node('Long Name Token','Long Label Token','prefix_LONG_ASSET_TOKEN'),rules=[rule('labelPrefix','Long','B.PNG'),rule('assetIdWord','LONG_ASSET_TOKEN','B.PNG'),rule('exactAssetId',n.asset)];assert.equal(match(rules,n).kind,'exactAssetId');});
test('longer asset word wins before shorter name/label words',()=>{const n=node('Token','Token','prefix_LONG_TOKEN');assert.equal(match([rule('labelWord','Token','B.PNG'),rule('nameWord','Token','B.PNG'),rule('assetIdWord','LONG_TOKEN')],n).kind,'assetIdWord');});
test('equal word length ties prefer label then name then asset, then earlier row',()=>{const n=node('Token','Token','prefix_TOKEN'),rules=[rule('assetIdWord','TOKEN','B.PNG'),rule('nameWord','Token','B.PNG'),rule('labelWord','Token')];assert.equal(match(rules,n).kind,'labelWord');rules.pop();assert.equal(match(rules,n).kind,'nameWord');assert.equal(match([rule('assetIdWord','TOKEN'),rule('assetIdWord','token','B.PNG')],n).ruleIndex,0);});
test('new asset word rules stay ahead of preserved legacy prefix rules',()=>{const n=node('LegacyItem','Label','prefix_TOKEN');assert.equal(match([rule('namePrefix','Legacy','B.PNG'),rule('assetIdWord','TOKEN')],n).kind,'assetIdWord');});
for(const kind of ['exactAssetId','assetIdWord'])test('actual shared resolver uses '+kind+' in Menu and preview',()=>{const n=node('Unnamed','Unlabelled','prefix_TOKEN'),rules=[rule(kind,kind==='exactAssetId'?n.asset:'TOKEN')],e=environment(n,rules),resolver=e.support.createIconResolver('C:/scratch/Resources',()=>rules),icon=resolver.resolve(n,rules);assert.equal(icon.source,'custom');assert.equal(icon.icon,'A.png');assert.equal(icon.usable,true);const preview=e.support.previewMenu(e.context.Scene,config(rules),resolver,false);assert(preview.ok,preview.message);assert.equal(preview.rows[0].icon,icon.icon);assert.equal(preview.rows[0].source,icon.source);noWrites(e);});
test('missing configured asset icon falls back through the same shared resolver',()=>{const n=node('Item','Label','prefix_TOKEN'),rules=[rule('exactAssetId',n.asset,'Missing.png')],e=environment(n,rules),resolved=e.support.createIconResolver('C:/scratch/Resources').resolve(n,rules);assert.notEqual(resolved.source,'custom');noWrites(e);});

test('previewIconRules snapshots actual name/label/assetId once and matches asset rules',()=>{const n=node('Item','Label','/data/Item.dsf#Item'),e=environment(n);let names=0,labels=0,assets=0;delete n.name;n.getName=()=>{names++;return 'Item';};n.getLabel=()=>{labels++;return 'Label';};Object.defineProperty(n,'assetId',{get(){assets++;return '/data/Item.dsf#Item';}});const result=e.support.previewIconRules([rule('exactAssetId','/data/Item.dsf#Item')],[n],1);assert.equal(result.rows[0].match.kind,'exactAssetId');assert.equal(result.rows[0].assetId,'/data/Item.dsf#Item');assert.equal(names,1);assert.equal(labels,1);assert.equal(assets,1);noWrites(e);});
test('mode choices pair exact and word fields while AssetId copy keeps its mode',()=>{const n=node(),e=environment(n);e.g.steps=[()=>{assert.deepEqual(plain(e.kindCombo().items),['Exact name','Word in name','Exact label','Word in label','Exact assetId','Word in assetId']);assert.deepEqual(plain(e.modePicker().kinds),['exactName','nameWord','exactLabel','labelWord','exactAssetId','assetIdWord']);assert.equal(e.kindCombo().currentItem,2);e.kindCombo().currentItem=4;e.click('Use Selected AssetId');assert.equal(e.one('DzLineEdit').text,n.assetId);assert.equal(e.kindCombo().currentItem,4);e.click('Add Rule');return true;}];assert(dialog(e).saved);assert.deepEqual(plain(e.g.saved[0].config.iconRules),[rule('exactAssetId',n.assetId)]);noWrites(e);});
test('unavailable assetId disables the copy button and never copies elementID/name',()=>{const n=node('pretend','pretend','pretend');delete n.assetId;const e=environment(n);e.g.steps=[()=>{assert.equal(e.button('Use Selected AssetId').enabled,false);assert(e.g.widgets.some(w=>w.kind==='DzLabel'&&w.text==='AssetId unavailable'));assert.equal(e.one('DzLineEdit').text,'pretend');return false;}];assert.equal(dialog(e).saved,false);assert.equal(e.g.saved.length,0);noWrites(e);});
test('selected item gets a centered large Selected heading and raw dynamic caption',()=>{const n=node('Internal','<Visible>'),e=environment(n);e.g.steps=[()=>{caption(e,n);const body=e.one('DzScrollArea').widget,heading=e.g.widgets.find(w=>w.kind==='DzLabel'&&inside(w,body)&&w.text==='Selected');assert(heading);assert.equal(heading.alignment,e.context.DzLabel.AlignHCenter);assert(heading.font.bold);assert(heading.font.pointSize>=16);assert.equal(heading.textFormat,e.context.DzLabel.PlainText);return false;}];dialog(e);noWrites(e);});
test('whole figure gets a centered large On Figure heading through automatic owner navigation',()=>{const {e,a}=figureWorld();e.g.steps=[()=>{wholeOwner(e,a);const body=e.one('DzScrollArea').widget,heading=e.g.widgets.find(w=>w.kind==='DzLabel'&&inside(w,body)&&w.text==='On Figure');assert(heading);assert.equal(heading.alignment,e.context.DzLabel.AlignHCenter);assert(heading.font.bold);assert(heading.font.pointSize>=16);caption(e,a);return false;}];dialog(e);noWrites(e);});
test('tile click changes internal editing target and default form without changing Scene selection',()=>{const {e,a,b}=figureWorld();e.g.steps=[()=>{wholeOwner(e,a);clickTile(e,b);caption(e,b);assert.equal(e.kindCombo().currentItem,2);assert.equal(e.one('DzLineEdit').text,b.label);assert.equal(e.g.selected,a);assert.equal(e.g.selectedNodes.length,1);assert.equal(e.g.selectedNodes[0],a);assert.equal(e.preview().rows.length,2,'Whole-figure preview mode remains available');e.kindCombo().currentItem=4;e.click('Use Selected AssetId');assert.equal(e.one('DzLineEdit').text,b.assetId);return false;}];assert.equal(dialog(e).saved,false);assert.equal(e.g.saved.length,0);noWrites(e);});
test('tile click auto-loads an applicable exact asset rule for the target',()=>{const {e,a,b}=figureWorld([rule('exactAssetId','/data/Vendor/ItemB.dsf#ItemB','B.PNG')]);e.g.steps=[()=>{wholeOwner(e,a);clickTile(e,b);caption(e,b);assert.equal(e.kindCombo().currentItem,4);assert.equal(e.one('DzLineEdit').text,b.assetId);assert.equal(e.iconCombo().items[e.iconCombo().currentItem],'B.PNG');assert.equal(e.button('Update Rule').enabled,true);assert.equal(e.g.selected,a);return false;}];dialog(e);assert.equal(e.g.saved.length,0);noWrites(e);});
for(const save of [false,true])test('valid dirty form is kept before tile switch; '+(save?'Save persists':'Cancel discards')+' all drafts',()=>{const {e,a,b}=figureWorld();e.g.steps=[()=>{wholeOwner(e,a);e.one('DzLineEdit').text='Custom Alpha';e.iconCombo().currentItem=1;clickTile(e,b);caption(e,b);assert(e.one('DzListBox').items.some(text=>text.includes('Custom Alpha')));assert.equal(e.one('DzLineEdit').text,b.label);assert.equal(e.g.saved.length,0,'Switch must only update the in-memory draft');assert.equal(e.g.selected,a);return save;}];assert.equal(dialog(e).saved,save);assert.equal(e.g.saved.length,save?1:0);if(save)assert.deepEqual(plain(e.g.saved[0].config.iconRules),[rule('exactLabel','Custom Alpha','B.PNG')]);noWrites(e);});
test('valid edit of an existing rule replaces that row before switching targets',()=>{const {e,a,b}=figureWorld([rule('exactLabel','Alpha')]);e.g.steps=[()=>{wholeOwner(e,a);assert.equal(e.button('Update Rule').enabled,true);e.iconCombo().currentItem=1;clickTile(e,b);assert.equal(e.one('DzListBox').items.length,1);return true;}];assert(dialog(e).saved);assert.deepEqual(plain(e.g.saved[0].config.iconRules),[rule('exactLabel','Alpha','B.PNG')]);noWrites(e);});
test('invalid dirty form blocks tile switch and retains pattern target and list',()=>{const {e,a,b}=figureWorld();e.g.steps=[()=>{wholeOwner(e,a);e.one('DzLineEdit').text='   ';clickTile(e,b);caption(e,a);assert.equal(e.one('DzLineEdit').text,'   ');assert.equal(e.one('DzListBox').items.length,0);assert(e.status().text.includes('Keep this draft:'),e.status().text);assert.equal(e.g.selected,a);return false;}];assert.equal(dialog(e).saved,false);assert.equal(e.g.saved.length,0);noWrites(e);});
test('stale preview tile rejects target change before committing the dirty draft',()=>{const {e,a,b,figure}=figureWorld();e.g.steps=[()=>{wholeOwner(e,a);e.one('DzLineEdit').text='Pending Alpha';const button=tile(e,b);e.g.nodes=e.g.nodes.filter(n=>n!==b);figure.children=figure.children.filter(n=>n!==b);e.emit(button,'clicked()');caption(e,a);assert.equal(e.one('DzLineEdit').text,'Pending Alpha');assert.equal(e.one('DzListBox').items.length,0);assert(e.status().text.includes('unavailable'));return false;}];dialog(e);assert.equal(e.g.saved.length,0);noWrites(e);});
test('tile moved to another owner rejects change before committing the dirty draft',()=>{const {e,a,b,figure}=figureWorld(),other=node('Genesis8Female','Other Figure');other.type='DzFigure';e.g.nodes.push(other);e.g.steps=[()=>{wholeOwner(e,a);e.one('DzLineEdit').text='Pending Alpha';const button=tile(e,b);figure.children=figure.children.filter(n=>n!==b);b.parent=other;other.children=[b];e.emit(button,'clicked()');caption(e,a);assert.equal(e.one('DzListBox').items.length,0);assert.equal(e.one('DzLineEdit').text,'Pending Alpha');assert(e.status().text.includes('no longer belongs'));return false;}];dialog(e);assert.equal(e.g.saved.length,0);noWrites(e);});

for(const [name,filePath,author,raw,key,expectedAuthor] of [
 ['standard vendor','/data/Vendor/Product/ItemKey/Name.dsf','','RawDifferent','ItemKey','Vendor'],
 ['explicit author','/data/Vendor/Product/ItemKey/Name.dsf','Creator','RawDifferent','ItemKey','Creator'],
 ['quoted first author','/data/Vendor/Product/ItemKey/Name.dsf','["Creator","Other",""]','RawDifferent','ItemKey','Creator'],
 ['quoted empty first author','/data/Vendor/Product/ItemKey/Name.dsf','["","Other",""]','RawDifferent','ItemKey',''],
 ['nonstandard raw fallback','/data/Vendor/Item.dsf','Creator','RawFallback','RawFallback','Creator'],
 ['author only','Name.dsf','Creator','','','Creator'],
 ['empty metadata','Name.dsf','','','',''],
 ['empty item folder raw fallback','/data/Vendor/Product//Name.dsf','','RawFallback','RawFallback','Vendor'],
 ['encoded item retained','/data/Vendor/Product/Item%20Key/Name.dsf','','RawDifferent','Item%20Key','Vendor']
])test('asset caption/key matches ACTUAL original Menu helper: '+name,()=>{
 const n=metadataNode(filePath,author,raw),e=environment(n),info=e.support.wearableAssetInfo(n);
 assert.equal(info.assetId,key);assert.equal(info.author,expectedAuthor);assert.equal(info.caption,originalCaption(n));
 assert.equal(e.support.iconNodeAssetId(n),key);noWrites(e);
});
for(const file of ['Wearables Manager Full.dsa','Wearables Manager Menu.dsa'])test(file+' actual caption wrapper delegates to the same shared info',()=>{
 const n=metadataNode('/data/Vendor/Product/Key/Name.dsf','["Creator","Other"]','Raw'),e=environment(n),source=fs.readFileSync(path.join(root,file),'utf8');
 const wrapper=vm.runInNewContext(actualFunction(source,'GetWearableItemAuthorString')+'\nGetWearableItemAuthorString;',{WM2Support:e.support});
 assert.equal(wrapper(n),originalCaption(n));assert.equal(wrapper(n),e.support.wearableAssetInfo(n).caption);noWrites(e);
});
test('missing/throwing asset metadata fails gracefully and never coerces raw identity',()=>{
 const e=environment();assert.deepEqual(plain(e.support.wearableAssetInfo(null)),{assetId:'',author:'',caption:''});
 const n=node('PretendKey','PretendKey','Fallback');Object.defineProperty(n,'assetUri',{get(){throw Error('Unavailable URI');}});Object.defineProperty(n,'assetAuthor',{get(){throw Error('Unavailable author');}});
 assert.deepEqual(plain(e.support.wearableAssetInfo(n)),{assetId:'Fallback',author:'',caption:'Fallback'});
 n.assetId={toString:()=> 'PretendKey'};assert.equal(e.support.iconNodeAssetId(n),'');noWrites(e);
});
test('standard folder key takes priority without reading raw assetId',()=>{
 const n=metadataNode(),e=environment(n);Object.defineProperty(n,'assetId',{get(){throw Error('Raw fallback must not be read');}});
 assert.equal(e.support.iconNodeAssetId(n),'ItemKey');assert.equal(e.support.wearableAssetInfo(n).caption,'ItemKey by Vendor');noWrites(e);
});
test('Exact AssetId matches key only, ignoring author raw URI name and label',()=>{
 const n=metadataNode('/data/Vendor/Product/Coat (1)/Name.dsf','Creator','RawOpaque');
 assert.equal(match([rule('exactAssetId','coat (1)')],n).matched,true);
 for(const wrong of ['Coat','Coat (1) by Creator','Creator','RawOpaque',n.assetUri.filePath,n.name,n.label])assert.equal(match([rule('exactAssetId',wrong)],n).matched,false);
});
test('AssetId word matches the derived key with established boundaries and case',()=>{
 const n=metadataNode('/data/Vendor/Product/LONG_Coat-2/Name.dsf','Creator','RawOpaque');
 assert.equal(match([rule('assetIdWord','coat')],n).matched,true);assert.equal(match([rule('assetIdWord','Creator')],n).matched,false);
 assert.equal(match([rule('assetIdWord','RawOpaque')],n).matched,false);
});
for(const kind of ['exactAssetId','assetIdWord'])test('derived '+kind+' stays consistent across matcher resolver and both preview APIs',()=>{
 const n=metadataNode('/data/Vendor/Product/Item_Key/Name.dsf','Creator','RawDifferent'),rules=[rule(kind,kind==='exactAssetId'?'Item_Key':'key')],e=environment(n,rules);
 const resolver=e.support.createIconResolver('C:/scratch/Resources',()=>rules),icon=resolver.resolve(n,rules);assert.equal(icon.source,'custom');assert.equal(icon.icon,'A.png');
 const simple=e.support.previewIconRules(rules,[n],1);assert.equal(simple.rows[0].assetId,'Item_Key');assert.equal(simple.rows[0].assetCaption,'Item_Key by Creator');assert.equal(simple.rows[0].match.kind,kind);
 const menu=e.support.previewMenu(e.context.Scene,config(rules),resolver,false);assert(menu.ok,menu.message);assert.equal(menu.rows[0].assetId,'Item_Key');assert.equal(menu.rows[0].assetCaption,'Item_Key by Creator');assert.equal(menu.rows[0].icon,icon.icon);noWrites(e);
});
test('UI copies KEY ONLY while preview shows the original item-key-by-author caption',()=>{
 const n=metadataNode('/data/Vendor/Product/Item_Key/Name.dsf','["Creator","Other"]','RawDifferent'),e=environment(n);
 e.g.steps=[()=>{e.kindCombo().currentItem=4;e.click('Use Selected AssetId');assert.equal(e.one('DzLineEdit').text,'Item_Key');
  const body=e.one('DzScrollArea').widget,label=e.g.widgets.find(w=>w.kind==='DzLabel'&&inside(w,body)&&w.text==='Item_Key by Creator');assert(label);assert.equal(label.textFormat,e.context.DzLabel.PlainText);return false;}];
 assert.equal(dialog(e).saved,false);assert.equal(e.g.saved.length,0);noWrites(e);
});
test('child to owner to child navigation preserves Scene selection and forces whole-owner preview',()=>{
 const {e,a,b,figure}=figureWorld();e.g.steps=[()=>{assert.equal(backButton(e).wm2OwnerNode,figure);clickBack(e);caption(e,figure);assert.equal(e.preview().activeNode.elementID,figure.elementID);assert.equal(e.preview().canReturnToOwner,false);assert.equal(e.preview().wholeFigure,true);assert.equal(e.preview().rows.length,2);clickTile(e,b);caption(e,b);assert.equal(backButton(e).wm2OwnerNode,figure);assert.equal(e.g.selected,a);return false;}];
 assert.equal(dialog(e).saved,false);assert.equal(e.g.saved.length,0);noWrites(e);
});
for(const save of [false,true])test('back navigation keeps valid dirty edits; '+(save?'Save persists':'Cancel discards')+' both child drafts',()=>{
 const {e,a,b,figure}=figureWorld();e.g.steps=[()=>{e.one('DzLineEdit').text='Pending Alpha';e.iconCombo().currentItem=1;clickBack(e);caption(e,figure);assert.equal(e.one('DzListBox').items.length,1);clickTile(e,b);e.one('DzLineEdit').text='Pending Beta';e.iconCombo().currentItem=1;clickBack(e);caption(e,figure);assert.equal(e.one('DzListBox').items.length,2);assert.equal(e.g.saved.length,0);assert.equal(e.g.selected,a);return save;}];
 assert.equal(dialog(e).saved,save);assert.equal(e.g.saved.length,save?1:0);if(save)assert.deepEqual(plain(e.g.saved[0].config.iconRules),[rule('exactLabel','Pending Alpha','B.PNG'),rule('exactLabel','Pending Beta','B.PNG')]);noWrites(e);
});
test('invalid dirty form blocks Back to owner without changing target or list',()=>{
 const {e,a}=figureWorld();e.g.steps=[()=>{e.one('DzLineEdit').text='   ';clickBack(e);caption(e,a);assert.equal(e.one('DzLineEdit').text,'   ');assert.equal(e.one('DzListBox').items.length,0);assert(e.status().text.includes('Keep this draft:'));return false;}];dialog(e);assert.equal(e.g.saved.length,0);noWrites(e);
});
test('stale owner Back callback rejects before committing a pending child draft',()=>{
 const {e,a,figure}=figureWorld();e.g.steps=[()=>{e.one('DzLineEdit').text='Pending Alpha';const callback=backButton(e).signals['clicked()'][0];e.g.nodes=e.g.nodes.filter(n=>n!==figure);callback();caption(e,a);assert.equal(e.one('DzListBox').items.length,0);assert(e.status().text.includes('unavailable'));return false;}];dialog(e);assert.equal(e.g.saved.length,0);noWrites(e);
});
test('cross-owner stale Back callback rejects after its active child changes owner',()=>{
 const {e,a,figure}=figureWorld(),other=node('Genesis8Female','Other Figure');other.type='DzFigure';e.g.nodes.push(other);
 e.g.steps=[()=>{e.one('DzLineEdit').text='Pending Alpha';const callback=backButton(e).signals['clicked()'][0];figure.children=figure.children.filter(n=>n!==a);a.parent=other;other.children=[a];callback();caption(e,a);assert.equal(e.one('DzListBox').items.length,0);assert(e.status().text.includes('no longer belongs'));return false;}];dialog(e);assert.equal(e.g.saved.length,0);noWrites(e);
});
test('back owner metadata uses the same Menu graph for nested bone fitted and parked items',()=>{
 for(const kind of ['nested','bone','fitted','parked']){
  const f=node('Genesis9','Main Figure');f.type='DzFigure';const target=node('Target','Target'),nodes=[f,target];
  if(kind==='nested'){const cloth=node('Cloth','Cloth');cloth.type='DzFigure';cloth.parent=f;cloth.follow=f;target.parent=cloth;cloth.children=[target];f.children=[cloth];nodes.push(cloth);}
  if(kind==='bone'){target.type='DzBone';target.parent=f;f.children=[target];}
  if(kind==='fitted'){target.type='DzFigure';target.follow=f;}
  if(kind==='parked'){const group=node('Storage','Storage');group.type='DzGroupNode';target.parent=group;group.children=[target];nodes.push(group);for(const n of [f,group])n.findDataItem=()=>({getSettings:()=>({getStringValue:(key,fallback)=>key==='ID'?'binding':fallback})});}
  const e=environment(target,[],nodes),graph=e.support.menuGraph(e.context.Scene,config()),resolver=e.support.createIconResolver('C:/scratch/Resources');
  const result=e.support.previewMenu(e.context.Scene,config(),resolver,false);assert(result.ok,result.message);assert.equal(result.owner.elementID,graph.owner(target).elementID);assert.equal(result.owner.elementID,f.elementID);assert.equal(result.activeNode.elementID,target.elementID);assert.equal(result.canReturnToOwner,true);
  const owner=e.support.previewMenu(e.context.Scene,config(),resolver,true,null,f);assert(owner.ok,owner.message);assert.equal(owner.activeNode.elementID,f.elementID);assert.equal(owner.canReturnToOwner,false);noWrites(e);
 }
});

// Numeric suffixes are literal pattern characters. The established separators
// are checked outside the entire matched pattern; no token rewriting is implied.
const numericWordKinds=['nameWord','labelWord','assetIdWord'];
function numericWordNode(kind,value){
 const n=metadataNode('/data/Vendor/Product/'+value+'/Name.dsf','Creator Earring04_L','DifferentRaw_Earring04_L');
 n.name='UnrelatedInternal';n.label='Unrelated Label';
 if(kind==='nameWord')n.name=value;
 if(kind==='labelWord')n.label=value;
 // A slash cannot be represented inside the original six-part item folder.
 // Test that opaque punctuation through the documented raw-key fallback instead.
 if(kind==='assetIdWord'&&value.includes('/')){n.assetUri.filePath='nonstandard/path';n.assetId=value;}
 return n;
}
for(const kind of numericWordKinds)test(kind+' matches full numeric patterns and searches later overlapping occurrences',()=>{
 const e=environment(),cases=[
  ['Earring','Earring04_L',true],['Earring04','Earring04_L',true],['Earring04_L','Earring04_L',true],
  ['eArRiNg04','EARRING04_l',true],['Earring04','Earring04',true],['Earring04','prefix-Earring04',true],
  ['Earring04','Earring04-suffix',true],['Earring04','04Earring04_L',true],['Earring04','Earring04123',true],
  ['Earring04','PreEarring04L Earring04_L',true],['Earring04','Earring04L !Earring04_L',true],
  ['Earring04Earring04','Earring04Earring04Earring04',true],
  ['Earring04','PreEarring04L PREearring04L',false],['Earring04','PreEarring04_Earring04L',false],
  ['Earring04','Earring04L',false],['Earring04','PreEarring04_L',false],['Earring','Earrings04',false],
  ['Earring04','Earring',false],['Earring_04','Earring04_L',false],['Earring_04','Earring_04_L',true]
 ];
 for(const [pattern,value,expected]of cases){const n=numericWordNode(kind,value),result=e.support.matchIcon([rule(kind,pattern)],n);assert.equal(result.matched,expected,kind+' '+JSON.stringify(pattern)+' in '+JSON.stringify(value));if(kind==='assetIdWord')assert.equal(e.support.iconNodeAssetId(n),value);}
 noWrites(e);
});
for(const kind of numericWordKinds)test(kind+' numeric pattern boundaries retain the established separator set only',()=>{
 const e=environment(),allowed=[' ','\t','\n','\r','\u00a0','0','4','9','-','_','!','\u2010','\u2011','\u2012','\u2013','\u2014','\u2015'],forbidden=['.','/','#',':','%','@','(',')','+','=','[',']','\\','\u2212','\u2016'];
 for(const separator of allowed){const value='prefix'+separator+'Earring04'+separator+'suffix';assert.equal(e.support.matchIcon([rule(kind,'Earring04')],numericWordNode(kind,value)).matched,true,kind+' allowed '+JSON.stringify(separator));}
 for(const separator of forbidden)for(const value of ['prefix'+separator+'Earring04','Earring04'+separator+'suffix'])assert.equal(e.support.matchIcon([rule(kind,'Earring04')],numericWordNode(kind,value)).matched,false,kind+' forbidden outside boundary '+JSON.stringify(value));
 noWrites(e);
});
for(const kind of numericWordKinds)test(kind+' patterns containing regex punctuation remain literal',()=>{
 const e=environment(),cases=[['Earring04.L','Earring04XL'],['Earring04+L','Earring044L'],['Earring04[L]','Earring04L'],['Earring04(L)','Earring04L'],['Earring04^L','Earring04L'],['Earring04$L','Earring04L'],['Earring04\\L','Earring04L'],['Earring04?L','Earring04L'],['Earring04|L','Earring04'],['Earring04{2}L','Earring044L']];
 for(const [pattern,different]of cases){assert.equal(e.support.matchIcon([rule(kind,pattern)],numericWordNode(kind,'prefix_'+pattern+'!suffix')).matched,true,kind+' literal '+JSON.stringify(pattern));assert.equal(e.support.matchIcon([rule(kind,pattern)],numericWordNode(kind,different)).matched,false,kind+' must not evaluate '+JSON.stringify(pattern)+' as regex');}
 noWrites(e);
});
for(const kind of numericWordKinds)test(kind+' numeric rule agrees across runtime resolver and both preview APIs using the Menu item key',()=>{
 const n=numericWordNode(kind,'Earring04_L');if(kind!=='nameWord')n.name='EarringLegacy';
 const rules=[rule('namePrefix','Earring','A.png'),rule(kind,'Earring04','B.PNG')],e=environment(n,rules),resolver=e.support.createIconResolver('C:/scratch/Resources',()=>rules),resolved=resolver.resolve(n,rules);
 assert.equal(resolved.source,'custom');assert.equal(resolved.icon,'B.PNG');assert.equal(e.support.matchIcon(rules,n).kind,kind);
 const simple=e.support.previewIconRules(rules,[n],1);assert.equal(simple.rows[0].match.kind,kind);assert.equal(simple.rows[0].assetId,'Earring04_L');assert.equal(simple.rows[0].assetCaption,'Earring04_L by Creator Earring04_L');
 const menu=e.support.previewMenu(e.context.Scene,config(rules),resolver,false);assert(menu.ok,menu.message);assert.equal(menu.rows[0].source,resolved.source);assert.equal(menu.rows[0].icon,resolved.icon);assert.equal(menu.rows[0].assetId,'Earring04_L');
 if(kind==='assetIdWord')for(const pattern of ['DifferentRaw','Creator'])assert.equal(e.support.matchIcon([rule(kind,pattern)],n).matched,false);
 noWrites(e);
});
for(const kind of numericWordKinds)test(kind+' Earring04 actual UI preview and Save preserve the existing legacy rule',()=>{
 const n=numericWordNode(kind,'Earring04_L');if(kind!=='nameWord')n.name='EarringLegacy';
 const legacy=rule('namePrefix','Earring','A.png'),e=environment(n,[legacy]);
 e.g.steps=[()=>{
  e.click('Clear Draft');e.kindCombo().currentItem={nameWord:1,labelWord:3,assetIdWord:5}[kind];e.one('DzLineEdit').text='Earring04';e.iconCombo().currentItem=e.iconCombo().items.indexOf('B.PNG');
  assert.equal(e.preview().rows.length,1);assert.equal(e.preview().rows[0].source,'custom');assert.equal(e.preview().rows[0].icon,'B.PNG');assert.equal(e.g.saved.length,0);return true;
 }];
 assert(dialog(e).saved);assert.deepEqual(plain(e.g.saved[0].config.iconRules),[legacy,rule(kind,'Earring04','B.PNG')]);
 const saved=plain(e.g.saved[0].config.iconRules);assert.equal(e.support.createIconResolver('C:/scratch/Resources').resolve(n,saved).icon,'B.PNG');noWrites(e);
});
for(const kind of numericWordKinds)test(kind+' numeric model Save keeps exact-rule priority and legacy configuration unchanged',()=>{
 const n=numericWordNode(kind,'Earring04_L');if(kind!=='nameWord')n.name='EarringLegacy';
 const exactKind={nameWord:'exactName',labelWord:'exactLabel',assetIdWord:'exactAssetId'}[kind],legacy=rule('namePrefix','Earring','A.png'),exact=rule(exactKind,'Earring04_L','B.PNG'),e=environment(n,[legacy,exact]),model=e.model();
 model.clear();model.setForm(rule(kind,'Earring04','A.png'));assert(model.save().ok);
 assert.deepEqual(plain(e.g.saved[0].config.iconRules),[legacy,exact,rule(kind,'Earring04','A.png')]);
 const result=e.support.matchIcon(e.g.saved[0].config.iconRules,n);assert.equal(result.kind,exactKind);assert.equal(result.icon,'B.PNG');noWrites(e);
});

const failures=tests.filter(item=>!item.pass);
console.log(JSON.stringify({passed:tests.length-failures.length,failed:failures.length,nativeExecuted:false,sourceSHA256:Object.fromEntries(Object.entries(sourcePaths).map(([key,file])=>[key,crypto.createHash('sha256').update(snapshots.get(path.resolve(file))).digest('hex')])),failures}));
process.exitCode=failures.length?1:0;
