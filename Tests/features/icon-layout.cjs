'use strict';
// Actual-source native-widget signal tests in isolated mocks. Stdout only:
// no DAZ, preference files, scene mutations, prototype edits or receipts.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const args=process.argv.slice(2);
if(args.length&&(args.length!==2||args[0]!=='--source-root'))throw Error('Usage: node Tests/features/icon-layout.cjs [--source-root <product-root>]');
const root=path.resolve(args.length?args[1]:path.join(__dirname,'../..')),directory=path.join(root,'Tests/features');
const files={support:path.join(root,'Resources/WM2 Support.dsa'),ui:path.join(root,'Resources/WM2 Settings UI.dsa')};
const texts=new Map(Object.values(files).map(file=>[path.resolve(file),fs.readFileSync(file,'utf8')]));
const readOnlyFS={readFileSync(file,encoding){const value=texts.get(path.resolve(file));return value===undefined?fs.readFileSync(file,encoding):encoding?value:Buffer.from(value);}};
function isolatedRequire(name){if(name==='fs'||name==='node:fs')return readOnlyFS;if(!['path','node:path','vm','node:vm','assert','node:assert','crypto','node:crypto'].includes(name))throw Error('Unexpected helper dependency '+name);return require(name);}
const helperFile=path.join(directory,'ui.cjs'),helperText=fs.readFileSync(helperFile,'utf8'),stop=helperText.indexOf("test('ES5");assert(stop>0,'Bounded actual UI helper prefix is required');
const helperContext=vm.createContext({require:isolatedRequire,__dirname:directory,__filename:helperFile,Buffer,console,module:{exports:{}},process:{argv:[]}});
vm.runInContext(helperText.slice(0,stop)+'\nmodule.exports={environment};',helperContext,{filename:helperFile});
const ui=helperContext.module.exports,plain=value=>JSON.parse(JSON.stringify(value)),tests=[];
function test(name,run){try{run();tests.push({name,pass:true});}catch(error){tests.push({name,pass:false,message:String(error),stack:error.stack});}}
const kinds=['exactName','exactLabel','nameWord','labelWord','exactAssetId','assetIdWord'];
const modePNGs=['Wearables Manager - Match Exact Name.png','Wearables Manager - Match Exact Label.png','Wearables Manager - Match Word Name.png','Wearables Manager - Match Word Label.png','Wearables Manager - Match Exact AssetId.png','Wearables Manager - Match Word AssetId.png'];
const modeOnPNGs=modePNGs.map(name=>name.replace(/\.png$/,' On.png'));
const pngs=['A.png','B.PNG','Wearables Manager - Save.png','Wearables Manager - Cancel.png','Wearables Manager - Arrow Right.png',...modePNGs,...modeOnPNGs];
function rule(pattern,kind='exactLabel',icon='A.png',enabled){const value={kind,pattern,icon};if(enabled!==undefined)value.enabled=enabled;return value;}
function config(rules=[]){const value=plain(ui.environment().support.defaults());value.iconRules=rules;return value;}
let serial=100;
function node(name,label,type='DzNode'){
 return {name,label,type,elementID:String(serial++),parent:null,children:[],assetId:'RawDifferent',assetUri:{filePath:'/data/Vendor/Product/'+name+'/Node.dsf'},assetAuthor:{toString:()=> 'Creator'},
  getName(){return this.name;},getLabel(){return this.label;},className(){return this.type;},inherits(kind){return kind==='DzNode'||kind===this.type||kind==='DzSkeleton'&&this.type==='DzFigure';},
  getNodeParent(){return this.parent;},getNodeChildren(recursive){if(!recursive)return this.children;const rows=[],seen=new Set();const visit=owner=>{for(const child of owner.children){if(seen.has(child))continue;seen.add(child);rows.push(child);visit(child);}};visit(this);return rows;},
  getFollowTarget(){return null;},getNumGraftFigures(){return 0;},getGraftFigure(){return null;},findDataItem(){return null;},
  setSelected(){throw Error('Forbidden Scene selection');},addNodeChild(){throw Error('Forbidden reparent');},setFollowTarget(){throw Error('Forbidden FitTo');}};
}
function environment(rules=[],options={}){return ui.environment({config:config(rules),pngs,...options});}
function itemEnvironment(rules=[rule('Original'),rule('Beta')],options={}){const item=node('ItemAlpha','Alpha');return {e:environment(rules,{selected:item,nodes:[item],...options}),item};}
function world(rules=[rule('Original'),rule('Beta')]){
 const owner=node('Genesis9','Main Figure','DzFigure'),a=node('ItemAlpha','Alpha'),b=node('ItemBeta','Beta');a.parent=b.parent=owner;owner.children=[a,b];
 return {e:environment(rules,{selected:a,nodes:[owner,a,b]}),owner,a,b};
}
function signal(e,widget,signature,...values){const callbacks=widget.signals[signature]||[];assert.equal(callbacks.length,1,widget.kind+' '+signature);assert.equal(typeof e.emit,'function','Root fixture must expose instrumented emit');e.emit(widget,signature,...values);}
function modeIcons(e,index){const picker=e.modePicker();assert.equal(picker.currentItem,index);assert.equal(picker.buttons.filter(button=>button.checked).length,index>=0?1:0);for(let i=0;i<6;i++){const button=picker.buttons[i];assert.equal(button.checked,i===index);assert.equal(button.wm2ModeIconFilename,i===index?modeOnPNGs[i]:modePNGs[i]);}}
function clickMode(e,index){const picker=e.modePicker(),button=picker.buttons[index];assert(button.enabled);signal(e,button,'clicked()');assert.equal(picker.currentItem,index);assert.equal(e.g.focusedWidget,button);if(modePNGs.concat(modeOnPNGs).every(name=>e.g.pngs.includes(name)))modeIcons(e,index);return button;}
function selectRule(e,index){const before=e.ruleEditor();assert(before.rows[index]);signal(e,before.rows[index].button,'clicked()');const editor=e.ruleEditor();assert.equal(editor.currentItem,index);assert(editor.rows[index].selected);assert.equal(e.g.focusedWidget,editor.rows[index].button);assert.equal(editor.scroll.visibilityRequests.at(-1),editor.rows[index].widget);return editor;}
function setForm(e,pattern,icon='B.PNG',mode=1){clickMode(e,mode);e.one('DzLineEdit').text=pattern;e.iconCombo().currentItem=e.iconCombo().items.indexOf(icon);assert(e.iconCombo().currentItem>=0);}
function noWrites(e){assert.equal(e.g.sceneWrites,0);assert.equal(e.g.widgets.filter(widget=>widget.kind==='DzCheckBox').length,0);assert.equal(e.g.signalStack.length,0);assert.equal(e.g.destructiveReplacements.length,0,'Scroll contents must not be replaced');assert.equal(e.g.activeSenderDisposals.length,0,'A callback must not dispose its sender');assert.equal(e.g.scrollAttachments.filter(entry=>entry.insideSignal).length,0,'Signals must not attach scroll contents');for(const scroll of e.g.widgets.filter(widget=>widget.kind==='DzScrollArea'))assert.equal(e.g.scrollAttachments.filter(entry=>entry.scroll===scroll).length,1,'Each dialog scroll body is attached only once');}
function open(e){return e.context.WM2ShowIconRules('C:/scratch/Resources');}
function inside(widget,ancestor){for(let current=widget;current;current=current.parent)if(current===ancestor)return true;return false;}
function visible(widget){for(let current=widget;current;current=current.parent)if(current.deleted||current.visible===false||current.hidden===true)return false;return true;}
function tile(e,target){const body=e.one('DzScrollArea').widget,buttons=e.g.widgets.filter(widget=>widget.kind==='DzPushButton'&&inside(widget,body)&&visible(widget)&&widget.wm2EditingNode===target);assert.equal(buttons.length,1);return buttons[0];}
function clickTile(e,target){signal(e,tile(e,target),'clicked()');}
function back(e){const body=e.one('DzScrollArea').widget,buttons=e.g.widgets.filter(widget=>widget.kind==='DzPushButton'&&inside(widget,body)&&visible(widget)&&widget.wm2OwnerNode);assert.equal(buttons.length,1);return buttons[0];}
function selectedKind(e){const picker=e.modePicker();return picker.kinds[picker.currentItem];}

test('bounded prefix and shared inclusion do not construct widgets or access IO',()=>{const e=environment();assert.equal(e.g.widgets.length,0);assert.equal(e.g.ioCalls,0);assert.equal(e.g.sceneReads,0);noWrites(e);});
test('dialog shows a concise literal-boundary note and one icon dropdown, with no verbose instruction blocks',()=>{
 const e=environment();e.g.steps=[()=>{
  const labels=e.g.widgets.filter(w=>w.kind==='DzLabel'),notes=labels.filter(w=>w.text.startsWith('Words match literal text'));
  assert.equal(notes.length,1);assert(notes[0].text.length<=180);assert.equal(notes[0].textFormat,e.context.DzLabel.PlainText);assert(notes[0].font.bold);
  assert(labels.every(w=>w.text.length<=180));assert.equal(e.g.widgets.filter(w=>w.kind==='DzListBox').length,0);assert.equal(e.g.widgets.filter(w=>w.kind==='DzComboBox').length,1);assert.equal(e.g.widgets.filter(w=>w.kind==='DzTextEdit').length,0);return false;
 }];assert.equal(open(e).saved,false);noWrites(e);
});
test('six native mode buttons load all user normal/On pairs at 32 pixels with 44-pixel click surfaces',()=>{
 const e=environment(),loaded=[],Pixmap=e.context.Pixmap;
 // Record calls in this isolated fixture without changing native prototypes.
 e.context.Pixmap=function(file){if(typeof file==='string'&&path.basename(file).startsWith('Wearables Manager - Match '))loaded.push(path.basename(file));return new Pixmap(file);};
 e.g.steps=[()=>{
  const picker=e.modePicker();assert.deepEqual(plain(picker.kinds),kinds);assert.equal(picker.buttons.length,6);
  assert.deepEqual(loaded.slice().sort(),modePNGs.concat(modeOnPNGs).sort());modeIcons(e,0);
  for(let i=0;i<6;i++){const button=picker.buttons[i];assert.equal(button.wm2ModeKind,kinds[i]);assert(button.checkable);assert.equal(button.sizedFromIcon,true);assert.equal(button.minWidth,44);assert.equal(button.maxWidth,44);assert.equal(button.minHeight,44);assert.equal(button.maxHeight,44);assert.equal(button.pixmap.width,32);assert.equal(button.pixmap.height,32);assert.equal(button.getWidget().iconSize.width,32);assert.equal(button.getWidget().iconSize.height,32);assert.equal(button.getWidget().autoDefault,false);assert.equal(button.text,'');assert(e.g.images.some(image=>image.deleted));}
  const cached=picker.buttons.map(button=>({normal:button.wm2ModeNormalPixmap,on:button.wm2ModeOnPixmap}));
  for(let repeat=0;repeat<2;repeat++)for(let selected=0;selected<6;selected++){clickMode(e,selected);for(let i=0;i<6;i++)assert.equal(picker.buttons[i].pixmap,i===selected?cached[i].on:cached[i].normal);}
  assert.equal(loaded.length,12,'Mode selection reuses the twelve cached pixmaps without loading them again');
  assert(e.g.widgets.filter(w=>w.kind==='DzPushButton'&&w.wm2ModeKind).every(w=>picker.buttons.includes(w)));return false;
 }];open(e);noWrites(e);
});
test('clicking every mode and repeating the selected mode keeps exactly one button selected without applying settings',()=>{
 const e=environment();e.g.steps=[()=>{e.one('DzLineEdit').text='Pending';for(let i=0;i<6;i++)for(let repeat=0;repeat<2;repeat++){clickMode(e,i);assert.equal(e.modePicker().buttons.filter(button=>button.checked).length,1);assert.equal(e.modePicker().label.text,e.context.WM2SettingsKindLabel(kinds[i]));assert.equal(e.one('DzLineEdit').text,'Pending');}assert.equal(e.g.saved.length,0);return false;}];open(e);noWrites(e);
});
for(const throwing of [false,true])test('mode '+(throwing?'throwing PNG loader':'missing PNG')+' retains six usable literal text selectors',()=>{
 const e=environment([],{pngs:['A.png','B.PNG'],pixmapThrows:throwing});e.g.steps=[()=>{assert.deepEqual(plain(e.modePicker().buttons.map(button=>button.text)),['=N','=L','wN','wL','=A','wA']);for(let i=0;i<6;i++)clickMode(e,i);return false;}];open(e);noWrites(e);
});
test('loading each existing modern rule and Clear Draft synchronizes the single On icon without changing saved rules',()=>{
 for(let i=0;i<6;i++){
  const rules=[rule('Stored '+i,kinds[i],'A.png',false)],before=plain(rules),{e}=itemEnvironment(rules);
  e.g.steps=[()=>{modeIcons(e,1);selectRule(e,0);modeIcons(e,i);assert.equal(e.one('DzLineEdit').text,'Stored '+i);e.click('Clear Draft');modeIcons(e,0);assert.equal(e.ruleEditor().currentItem,-1);assert.equal(e.one('DzLineEdit').text,'');assert.equal(e.ruleEditor().entries[0].enabled,false);return false;}];
  assert.equal(open(e).saved,false);assert.deepEqual(rules,before);assert.equal(e.g.saved.length,0);noWrites(e);
 }
});
test('missing selected On files use the cached normal icons while preserving exclusive checked state',()=>{
 const e=environment([],{pngs:pngs.filter(name=>!modeOnPNGs.includes(name))});e.g.steps=[()=>{
  for(let selected=0;selected<6;selected++){clickMode(e,selected);for(let i=0;i<6;i++){const button=e.modePicker().buttons[i];assert.equal(button.wm2ModeIconFilename,modePNGs[i]);assert.equal(button.pixmap,button.wm2ModeNormalPixmap);assert.equal(button.checked,i===selected);assert.equal(button.text,'');}assert.equal(e.modePicker().buttons.filter(button=>button.checked).length,1);}return false;
 }];open(e);noWrites(e);
});
test('missing normal files never show an On image for an inactive mode and still show On for the selected mode',()=>{
 const e=environment([],{pngs:pngs.filter(name=>!modePNGs.includes(name))}),fallback=['=N','=L','wN','wL','=A','wA'];e.g.steps=[()=>{
  for(let selected=0;selected<6;selected++){clickMode(e,selected);for(let i=0;i<6;i++){const button=e.modePicker().buttons[i];assert.equal(button.checked,i===selected);assert.equal(button.wm2ModeIconFilename,i===selected?modeOnPNGs[i]:null);if(i===selected){assert.equal(button.pixmap,button.wm2ModeOnPixmap);assert.equal(button.getWidget().iconSize.width,32);assert.equal(button.getWidget().iconSize.height,32);assert.equal(button.text,'');}else assert.equal(button.text,fallback[i]);}}return false;
 }];open(e);noWrites(e);
});
test('both files missing for one pair leave its selected text fallback and all other pairs functional',()=>{
 const selected=4,e=environment([],{pngs:pngs.filter(name=>name!==modePNGs[selected]&&name!==modeOnPNGs[selected])});e.g.steps=[()=>{clickMode(e,selected);assert.equal(e.modePicker().buttons[selected].wm2ModeIconFilename,null);assert.equal(e.modePicker().buttons[selected].text,'=A');assert.equal(e.modePicker().buttons.filter(button=>button.checked).length,1);clickMode(e,3);assert.equal(e.modePicker().buttons[3].wm2ModeIconFilename,modeOnPNGs[3]);assert.equal(e.modePicker().buttons[selected].wm2ModeIconFilename,null);assert.equal(e.modePicker().buttons[selected].text,'=A');return false;}];open(e);noWrites(e);
});
test('a throwing loader for one On file falls back to its normal image without disabling other pairs',()=>{
 const e=environment(),Pixmap=e.context.Pixmap;e.context.Pixmap=function(file){if(typeof file==='string'&&path.basename(file)===modeOnPNGs[2])throw Error('Damaged On icon');return new Pixmap(file);};
 e.g.steps=[()=>{const button=e.modePicker().buttons[2];signal(e,button,'clicked()');assert.equal(e.modePicker().currentItem,2);assert(button.checked);assert.equal(button.wm2ModeIconFilename,modePNGs[2]);assert.equal(button.pixmap,button.wm2ModeNormalPixmap);assert.equal(button.text,'');signal(e,e.modePicker().buttons[5],'clicked()');assert.equal(e.modePicker().buttons[5].wm2ModeIconFilename,modeOnPNGs[5]);assert.equal(button.wm2ModeIconFilename,modePNGs[2]);return false;}];open(e);noWrites(e);
});
test('rule rows have only a left arrow and wrapped plain labels with a colored selected border',()=>{
 const rules=[rule('<Tag>& '.repeat(20),'exactLabel','A.png',false),rule('Enabled','nameWord','B.PNG',true),rule('Default')],e=environment(rules);
 e.g.steps=[()=>{
  const editor=e.ruleEditor();assert.equal(e.g.widgets.filter(widget=>widget.kind==='DzCheckBox').length,0);
  for(let i=0;i<editor.rows.length;i++){const row=editor.rows[i],children=row.widget.wm2TestLayout.children.filter(child=>child.widget).map(child=>child.widget);assert.equal(children[0],row.button);assert.equal(children[1],row.label.parent);assert(!row.checkBox);assert.equal(row.label.text,editor.entries[i].text);assert.equal(row.label.textFormat,e.context.DzLabel.PlainText);assert(row.label.wordWrap);assert(row.label.font.bold);assert(row.label.font.pointSize>=16);}
  const rows=editor.rows.slice(),borders=rows.map(row=>row.widget.getWidget().styleSheet);
  for(let selected=0;selected<3;selected++){selectRule(e,selected);assert.equal(editor.rows[selected],rows[selected]);assert.notEqual(rows[selected].widget.getWidget().styleSheet,borders[selected]);assert.equal(editor.rows.filter(row=>row.selected).length,1);}
  return true;
 }];assert(open(e).saved);assert.deepEqual(plain(e.g.saved[0].config.iconRules),rules);noWrites(e);
});
for(const status of ['future-schema','unreadable','path-error'])test(status+' disables editing and queued mode clicks preserve existing saved flags',()=>{
 const rules=[rule('Alpha','exactLabel','A.png',false),rule('Beta','exactLabel','A.png',true),rule('Default')],before=plain(rules),e=environment(rules,{status,readOnly:true});
 e.g.steps=[()=>{const picker=e.modePicker(),pattern=e.one('DzLineEdit').text;assert(picker.buttons.every(button=>!button.enabled));signal(e,picker.buttons[3],'clicked()');assert.equal(e.one('DzLineEdit').text,pattern);assert.equal(e.one('DzBasicDialog').acceptButton.enabled,false);return false;}];
 assert.equal(open(e).saved,false);assert.equal(e.g.saved.length,0);assert.deepEqual(rules,before);noWrites(e);
});
for(const kind of ['namePrefix','labelPrefix'])test(kind+' stays legacy with every mode icon off and its enabled flag unchanged',()=>{
 const rules=[rule('Alpha',kind,'A.png',false)],e=environment(rules);e.g.steps=[()=>{selectRule(e,0);modeIcons(e,-1);assert.equal(e.modePicker().label.text,e.context.WM2SettingsKindLabel(kind));assert(e.modePicker().buttons.every(button=>!button.enabled&&!button.checked));assert.equal(e.one('DzLineEdit').enabled,false);selectRule(e,0);modeIcons(e,-1);return true;}];assert(open(e).saved);assert.deepEqual(plain(e.g.saved[0].config.iconRules),rules);noWrites(e);
});
for(const enabled of [false,true,undefined])test('editing and Save retain existing enabled '+String(enabled)+' without adding a missing flag',()=>{
 const {e}=itemEnvironment([rule('Original','exactLabel','A.png',enabled),rule('Beta')]);e.g.steps=[()=>{selectRule(e,0);setForm(e,'Alpha');selectRule(e,0);assert.equal(e.one('DzLineEdit').text,'Alpha');return true;}];assert(open(e).saved);assert.deepEqual(plain(e.g.saved[0].config.iconRules),[rule('Alpha','exactLabel','B.PNG',enabled),rule('Beta')]);noWrites(e);
});
for(const enabled of [false,true,undefined])test('Cancel discards edits and keeps enabled '+String(enabled)+' caller data untouched',()=>{
 const rules=[rule('Original','exactLabel','A.png',enabled),rule('Beta')],before=plain(rules),{e}=itemEnvironment(rules);e.g.steps=[()=>{selectRule(e,0);setForm(e,'Alpha');return false;}];assert.equal(open(e).saved,false);assert.deepEqual(rules,before);assert.equal(e.g.saved.length,0);noWrites(e);
});
for(const enabled of [false,true,undefined])test('Move retains dirty edits and enabled '+String(enabled)+' on the moved rule',()=>{
 const {e}=itemEnvironment([rule('Original','exactLabel','A.png',enabled),rule('Beta','exactLabel','A.png',false)]);e.g.steps=[()=>{selectRule(e,0);setForm(e,'Alpha');const rows=e.ruleEditor().rows.slice();e.click('Move Down');assert.equal(e.ruleEditor().currentItem,1);assert.equal(e.ruleEditor().entries[1].text,'Alpha');assert.equal(e.ruleEditor().rows[0],rows[0]);assert.equal(e.ruleEditor().rows[1],rows[1]);assert.equal(e.ruleEditor().scroll.visibilityRequests.at(-1),rows[1].widget);return true;}];assert(open(e).saved);assert.deepEqual(plain(e.g.saved[0].config.iconRules),[rule('Beta','exactLabel','A.png',false),rule('Alpha','exactLabel','B.PNG',enabled)]);noWrites(e);
});
for(const enabled of [false,true,undefined])test('Update Rule retains existing enabled '+String(enabled)+' and stable row identity',()=>{
 const {e}=itemEnvironment([rule('Original','exactLabel','A.png',enabled),rule('Beta')]);e.g.steps=[()=>{selectRule(e,0);const row=e.ruleEditor().rows[0];setForm(e,'Alpha');e.click('Update Rule');assert.equal(e.ruleEditor().rows[0],row);assert.equal(e.one('DzLineEdit').text,'');return true;}];assert(open(e).saved);assert.deepEqual(plain(e.g.saved[0].config.iconRules),[rule('Alpha','exactLabel','B.PNG',enabled),rule('Beta')]);noWrites(e);
});
for(const invalid of [false,true])test('Remove discards its '+(invalid?'invalid':'valid')+' edited row while retaining other saved flags',()=>{
 const {e}=itemEnvironment([rule('Original','exactLabel','A.png',false),rule('Beta','exactLabel','A.png',true),rule('Default')]);e.g.steps=[()=>{selectRule(e,0);setForm(e,invalid?'   ':'Alpha');e.click('Remove');assert.equal(e.one('DzLineEdit').text,'');assert.equal(e.ruleEditor().entries.length,2);return true;}];assert(open(e).saved);assert.deepEqual(plain(e.g.saved[0].config.iconRules),[rule('Beta','exactLabel','A.png',true),rule('Default')]);noWrites(e);
});
test('repeated rule arrow selection reuses rows and both scroll bodies throughout native clicked callbacks',()=>{
 const rules=[rule('Alpha'),rule('Beta','exactLabel','A.png',false),rule('Third','exactLabel','A.png',true)],{e}=itemEnvironment(rules);e.g.steps=[()=>{
  const editor=e.ruleEditor(),rows=editor.rows.slice(),ruleBody=editor.scroll.widget,previewBody=e.one('DzScrollArea').widget;
  for(let repeat=0;repeat<4;repeat++)for(let index=0;index<3;index++){selectRule(e,index);assert.equal(editor.rows[index],rows[index]);assert.equal(editor.rows[index].button,rows[index].button);assert.equal(editor.scroll.widget,ruleBody);assert.equal(e.one('DzScrollArea').widget,previewBody);}
  return true;
 }];assert(open(e).saved);assert.deepEqual(plain(e.g.saved[0].config.iconRules),rules);noWrites(e);
});
test('repeated mode edits reuse rule and preview widgets while preserving a pending form',()=>{
 const {e,item}=itemEnvironment([rule('Alpha')]);e.g.steps=[()=>{
  selectRule(e,0);const editor=e.ruleEditor(),row=editor.rows[0],previewBody=e.one('DzScrollArea').widget,tileButton=tile(e,item);e.one('DzLineEdit').text='Pending';
  for(let repeat=0;repeat<3;repeat++)for(let index=0;index<6;index++){clickMode(e,index);assert.equal(editor.rows[0],row);assert.equal(e.one('DzScrollArea').widget,previewBody);assert.equal(tile(e,item),tileButton);assert.equal(e.one('DzLineEdit').text,'Pending');}
  return false;
 }];assert.equal(open(e).saved,false);assert.equal(e.g.saved.length,0);noWrites(e);
});
test('whole-owner preview keeps the same tile widgets while repeated selections update their current state',()=>{
 const {e,a,b}=world([rule('Alpha'),rule('Beta','exactLabel','A.png',false)]);e.g.steps=[()=>{
  e.click('Preview Scene');const body=e.one('DzScrollArea').widget,first=tile(e,a),second=tile(e,b);
  for(let repeat=0;repeat<3;repeat++){clickTile(e,b);assert.equal(e.preview().rows.length,2);assert.equal(tile(e,a),first);assert.equal(tile(e,b),second);clickTile(e,a);assert.equal(e.one('DzScrollArea').widget,body);assert.equal(tile(e,a),first);assert.equal(tile(e,b),second);}
  assert.equal(e.g.selected,a);return false;
 }];open(e);noWrites(e);
});
for(const invalid of [false,true])test('tile and Back clicks '+(invalid?'block invalid':'commit valid')+' dirty forms with stable widgets and unchanged enabled flags',()=>{
 const {e,a,b,owner}=world([rule('Original','exactLabel','A.png',false),rule('Beta','exactLabel','A.png',true)]);
 e.g.steps=[()=>{
  selectRule(e,0);setForm(e,invalid?'   ':'Alpha');e.click('Preview Scene');const body=e.one('DzScrollArea').widget,arrow=e.ruleEditor().rows[0].button,beta=tile(e,b),ownerButton=back(e);
  clickTile(e,b);
  if(invalid){assert.equal(e.one('DzBasicDialog').caption,'Icon rules for Alpha [ItemAlpha]');assert.equal(e.one('DzLineEdit').text,'   ');assert(e.status().text.includes('Keep this draft:'));signal(e,ownerButton,'clicked()');assert.equal(e.one('DzBasicDialog').caption,'Icon rules for Alpha [ItemAlpha]');assert.equal(e.one('DzLineEdit').text,'   ');}
  else{assert.equal(e.one('DzBasicDialog').caption,'Icon rules for Beta [ItemBeta]');signal(e,back(e),'clicked()');assert.equal(e.preview().activeNode.elementID,owner.elementID);clickTile(e,a);assert.equal(e.one('DzBasicDialog').caption,'Icon rules for Alpha [ItemAlpha]');}
  assert.equal(e.one('DzScrollArea').widget,body);assert.equal(tile(e,b),beta);assert.equal(e.ruleEditor().rows[0].button,arrow);assert.equal(e.g.selected,a);return !invalid;
 }];assert.equal(open(e).saved,!invalid);assert.equal(e.g.saved.length,invalid?0:1);if(!invalid)assert.deepEqual(plain(e.g.saved[0].config.iconRules),[rule('Alpha','exactLabel','B.PNG',false),rule('Beta','exactLabel','A.png',true)]);noWrites(e);
});
test('queued clicks from a hidden inactive rule arrow cannot select another entry after removal',()=>{
 const {e}=itemEnvironment([rule('Alpha'),rule('Beta'),rule('Third')]);e.g.steps=[()=>{
  selectRule(e,2);const inactive=e.ruleEditor().rows[2].button;e.click('Remove');assert.equal(e.ruleEditor().currentItem,-1);assert(!visible(inactive));signal(e,inactive,'clicked()');assert.equal(e.ruleEditor().currentItem,-1);assert.equal(e.one('DzLineEdit').text,'');return true;
 }];assert(open(e).saved);assert.deepEqual(plain(e.g.saved[0].config.iconRules),[rule('Alpha'),rule('Beta')]);noWrites(e);
});
test('queued clicks from hidden preview tile and Back controls cannot change a cleared selection',()=>{
 const {e,b}=world();e.g.steps=[()=>{
  e.click('Preview Scene');const inactiveTile=tile(e,b),inactiveBack=back(e);e.g.setSelection([]);const caption=e.one('DzBasicDialog').caption;assert(!visible(inactiveTile));assert(!visible(inactiveBack));signal(e,inactiveTile,'clicked()');signal(e,inactiveBack,'clicked()');assert.equal(e.one('DzBasicDialog').caption,caption);assert.equal(e.g.saved.length,0);return false;
 }];open(e);noWrites(e);
});
test('invalid dirty Move is blocked without replacing rows or losing the form or disabled flag',()=>{
 const {e}=itemEnvironment([rule('Original','exactLabel','A.png',false),rule('Beta')]);e.g.steps=[()=>{selectRule(e,0);const row=e.ruleEditor().rows[0];setForm(e,'   ');e.click('Move Down');assert.equal(e.ruleEditor().currentItem,0);assert.equal(e.ruleEditor().rows[0],row);assert.deepEqual(plain(e.ruleEditor().entries.map(entry=>entry.text)),['Original','Beta']);assert.equal(e.one('DzLineEdit').text,'   ');assert.equal(e.iconCombo().items[e.iconCombo().currentItem],'B.PNG');assert.equal(e.g.saved.length,0);return false;}];assert.equal(open(e).saved,false);noWrites(e);
});
test('failed Save retains edited fields disabled state and stable widget identities before Cancel',()=>{
 const {e}=itemEnvironment([rule('Original','exactLabel','A.png',false),rule('Beta')],{saveFailure:true});let row,body;
 e.g.steps=[()=>{selectRule(e,0);row=e.ruleEditor().rows[0];body=e.one('DzScrollArea').widget;setForm(e,'Alpha');return true;},()=>{assert.equal(e.one('DzLineEdit').text,'Alpha');assert.equal(e.ruleEditor().rows[0],row);assert.equal(e.one('DzScrollArea').widget,body);assert.equal(e.iconCombo().items[e.iconCombo().currentItem],'B.PNG');assert(e.status().text.includes('Forced save failure'));return false;}];assert.equal(open(e).saved,false);assert.equal(e.g.saved.length,1);assert.deepEqual(plain(e.g.saved[0].config.iconRules),[rule('Alpha','exactLabel','B.PNG',false),rule('Beta')]);noWrites(e);
});

const failures=tests.filter(test=>!test.pass);
console.log(JSON.stringify({passed:tests.length-failures.length,failed:failures.length,nativeExecuted:false,sourceSHA256:Object.fromEntries(Object.entries(files).map(([key,file])=>[key,crypto.createHash('sha256').update(texts.get(path.resolve(file))).digest('hex')])),failures}));
process.exitCode=failures.length?1:0;
