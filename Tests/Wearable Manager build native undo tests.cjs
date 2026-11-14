const fs=require('fs'),root=process.cwd().replaceAll('\\','/'),lib='D:/Tests/Main DAZ 3D Library/Presets/matew/WardrobeSetsPrototype',dest=root+'/.test-output/undo-library-'+(process.argv[2]||'6')+'-'+Date.now();
fs.mkdirSync(dest+'/Catalog',{recursive:true});fs.mkdirSync(dest+'/Logs',{recursive:true});fs.copyFileSync(lib+'/library.json',dest+'/library.json');const rev=fs.readdirSync(lib+'/Catalog').filter(n=>n.startsWith('rev_')).sort().pop();fs.copyFileSync(lib+'/Catalog/'+rev,dest+'/Catalog/'+rev);for(const dir of ['Items','Materials'])if(fs.existsSync(lib+'/'+dir))fs.cpSync(lib+'/'+dir,dest+'/'+dir,{recursive:true});
const src=fs.readFileSync('Wearable Manager Wardrobe.dsa','utf8');let body=`
var output=new DzFile(${JSON.stringify(root+'/.test-output/undo-matrix-')}+parseInt(App.versionString,10)+'.txt');output.open(DzFile.WriteOnly);
function emit(x){output.writeLine(x);output.close();output.open(DzFile.Append);}
function assertTest(v,s){if(!v)throw new Error(s);emit('PASS '+s);}
function run(a,p){var r=runAction(a,key(fig),p||{});assertTest(r.ok,a+' '+(p&&p.id||'')+' '+r.folder);return r;}
function snap(){syncHandPoseSession();var nodes=sceneNodes(),state={nodes:{},hands:{},session:clonePlain(handPoseSession)};for(var i=0;i<nodes.length;i++){var n=nodes[i],d=dataObject(n);if(String(n.objectName)==='Genesis8_1Male')state.hands[key(n)]={right:captureHandPose(n,'right'),left:captureHandPose(n,'left')};if(d)state.nodes[key(n)]={data:d,parent:key(n.getNodeParent()),follow:key(follow(n)),scalars:d.ItemID?scalarProperties(n):{},materials:d.ItemID?materials(n):{}};}return state;}
function differences(a,b,path){if(closeNumbers(a,b))return;if(!a||!b||typeof a!=='object'||typeof b!=='object'){emit('DIFF '+path+' '+String(JSON.stringify(a)).slice(0,250)+' -> '+String(JSON.stringify(b)).slice(0,250));return;}var ks=Object.keys(a);for(var i=0;i<Object.keys(b).length;i++)if(ks.indexOf(Object.keys(b)[i])<0)ks.push(Object.keys(b)[i]);for(var i=0;i<ks.length;i++)differences(a[ks[i]],b[ks[i]],path+'/'+ks[i]);}
function cycle(a,p){var before=snap(),undoCount=UndoStack.getNumUndoItems();run(a,p);var after=snap();if(closeNumbers(before,after)){emit('PASS unchanged action '+a);return;}assertTest(UndoStack.undo(),'native undo '+a);Scene.update();processEvents();sleep(250);Scene.update();processEvents();invalidateReadScope();var undoSnap=snap();if(!closeNumbers(before,undoSnap))differences(before,undoSnap,a);assertTest(closeNumbers(before,undoSnap),'exact metadata/links/hand undo '+a);assertTest(UndoStack.redo(),'native redo '+a);Scene.update();processEvents();sleep(250);Scene.update();processEvents();invalidateReadScope();var redoSnap=snap();if(!closeNumbers(after,redoSnap))differences(after,redoSnap,a+' redo');assertTest(closeNumbers(after,redoSnap),'exact metadata/links/hand redo '+a);}
try{
wardrobeResourceDirectory=${JSON.stringify(root+'/Resources')};app.libraryPath=${JSON.stringify(dest)};app.verificationMode='operational';App.getContentMgr().addContentDirectory('D:/Tests/Main DAZ 3D Library',false);refreshWM2Figures();app.db=readCatalog();
assertTest(App.getContentMgr().openFile('D:/Tests/Main DAZ 3D Library/People/Genesis 8 Male/Genesis 8.1 Basic Male.duf',true),'load figure');var nodes=sceneNodes(),fig;for(var i=0;i<nodes.length;i++)if(String(nodes[i].objectName)==='Genesis8_1Male')fig=nodes[i];fig.setLabel('Fred 8.1');clearUndoStack();
var sword=app.db.sets['matew_set_mv64xl4a_e_emo0nu'],sports=app.db.sets['matew_set_mv654aw9_p_2snd77'];
cycle('apply',{id:sword.id});
cycle('remove_set',{id:sword.id,commitID:app.db.commitID,libraryID:app.db.libraryID});
cycle('apply',{id:sword.id});
cycle('undress_all',{});cycle('apply',{id:sword.id});
cycle('apply',{id:sports.id});
var si=inventory(fig,app.db)[sports.items[0]],sp={targetKind:'item',itemID:sports.items[0],partID:app.db.items[sports.items[0]].parts[0].id,propertyName:'Scale',propertyLabel:'Scale',applyValue:1.03,resetValue:1,propertyNodePath:[],propertyGroupPath:'/General/Transforms/Scale',propertyOwnerName:String(si.root.getName())};
run('save',{id:sports.id,name:sports.name,scope:'label',scopeLabel:'Fred 8.1',items:sports.items.slice(0),nodes:[],properties:[sp],saveMaterials:false});
cycle('apply',{id:sports.id});cycle('restore_properties',{id:sports.id});
cycle('partial_apply',{id:sports.id,partial:{items:sports.items.slice(0),propertyKeys:[propertyOverrideKey(sp)],partStateKeys:[],removalMode:'keep_all',commitID:app.db.commitID,libraryID:app.db.libraryID}});
if(parseInt(App.versionString,10)===4){var red=app.db.sets['matew_set_mv657yf0_4_awhsml'];run('save',{id:red.id,name:red.name,scope:'label',scopeLabel:'Fred 8.1',items:sports.items.slice(0),nodes:[],properties:[],materialRequests:sports.items.map(function(id){return {itemID:id};}),saveMaterials:true});}
cycle('restore_materials',{id:'matew_set_mv657yf0_4_awhsml',commitID:app.db.commitID,itemIDs:sports.items.slice(0)});
cycle('partial_apply',{id:sports.id,partial:{items:[],propertyKeys:[],partStateKeys:[],removalMode:'take_all',commitID:app.db.commitID,libraryID:app.db.libraryID}});
cycle('apply',{id:sword.id});cycle('apply',{id:sports.id});
cycle('store_registered',{itemID:sports.items[0]});cycle('return_registered',{itemID:sports.items[0]});
cycle('apply',{id:'matew_set_mv657yf0_4_awhsml'});
cycle('bulk_move',{storeIDs:sports.items.slice(0),restoreIDs:[],commitID:app.db.commitID,libraryID:app.db.libraryID});
cycle('bulk_move',{storeIDs:[],restoreIDs:sports.items.slice(0),commitID:app.db.commitID,libraryID:app.db.libraryID});
cycle('store_registered',{itemID:sword.items[0]});cycle('return_registered',{itemID:sword.items[0]});
var sourceFig=fig;Scene.selectAllNodes(false);Scene.setPrimarySelection(null);
assertTest(App.getContentMgr().openFile('D:/Tests/Main DAZ 3D Library/People/Genesis 8 Male/Genesis 8.1 Basic Male.duf',true),'load recipient');
var all=sceneNodes();for(var fi=0;fi<all.length;fi++)if(String(all[fi].objectName)==='Genesis8_1Male'&&!same(all[fi],sourceFig))fig=all[fi];fig.setLabel('Fred 8.1');
var model=discoverOutfitSources(sword,fig),choices=clonePlain(model);delete choices.rows;choices.decisions=[];
for(var ci=0;ci<model.rows.length;ci++)choices.decisions.push({itemID:model.rows[ci].itemID,kind:'transfer',source:clonePlain(model.rows[ci].options[0])});
cycle('apply',{id:sword.id,sources:choices});
sourceFig.setLabel('Undo Source');run('delete',{id:sword.id});cycle('unregister_registered',{itemID:sword.items[0]});
var root=null;all=sceneNodes();for(var ni=0;ni<all.length;ni++)if(String(all[ni].getLabel())==='Time Rogue Sword'&&!dataObject(all[ni]))root=all[ni];
assertTest(!!root,'unregistered sword available for fresh registration');
cycle('save',{name:'Undo registration fixture',scope:'type',items:[],nodes:[key(root)],properties:[],saveMaterials:false});
var count=UndoStack.getNumUndoItems(),beforeFailure=snap(),storeOriginal=storeItemImpl;
storeItemImpl=function(it,inf,f){storeOriginal(it,inf,f);throw problem('INJECTED_UNDO_TEST','after storing');};
var failed=runAction('undress_all',key(fig),{});storeItemImpl=storeOriginal;
assertTest(!failed.ok,'injected failure reported');assertTest(closeNumbers(beforeFailure,snap()),'failed action restored state');assertTest(UndoStack.getNumUndoItems()===count,'failed action adds no undo entry');
var savedID=null,setIDs=Object.keys(app.db.sets);for(var zi=0;zi<setIDs.length;zi++)if(app.db.sets[setIDs[zi]].name==='Undo registration fixture')savedID=setIDs[zi];
Scene.removeNode(root);cycle('apply',{id:savedID});
var persistentBefore={},all=sceneNodes();for(var pi=0;pi<all.length;pi++){var pd=dataObject(all[pi]);if(pd&&(pd.NodeID||pd.FigureID))persistentBefore[pd.NodeID||pd.FigureID]=pd;}
var sceneFile=app.libraryPath+'/undo-scene.duf',io=App.getAssetIOMgr(),filter=io.getAssetFilter(io.findAssetFilterIndex('DzSceneAssetFilter')),opts=new DzFileIOSettings();filter.getDefaultOptions(opts);filter.getOptions(opts,false,'');opts.setBoolValue('CompressOutput',false);opts.setBoolValue('RunSilent',true);
assertTest(Number(io.doSaveWithOptions(filter,opts,true,sceneFile.slice(0,-4),app.libraryPath,''))===0,'save scene with undo metadata');filter.deleteLater();
Scene.clear();handPoseUndoState=null;handPoseSession={};assertTest(App.getContentMgr().openFile(sceneFile,true),'reload scene');
var persistentAfter={},all=sceneNodes();for(var pi=0;pi<all.length;pi++){var pd=dataObject(all[pi]);if(pd&&(pd.NodeID||pd.FigureID))persistentAfter[pd.NodeID||pd.FigureID]=pd;if(String(all[pi].objectName)==='Genesis8_1Male'&&String(all[pi].getLabel())==='Fred 8.1')fig=all[pi];}
assertTest(closeNumbers(persistentBefore,persistentAfter),'all metadata survives scene save/reload');
cycle('undress_all',{});cycle('apply',{id:savedID});
emit('PASS MATRIX COMPLETE');
}catch(e){emit('FAIL '+errorText(e));}finally{output.close();App.delayedExit(0);}
})();`;
fs.writeFileSync('.test-output/undo-matrix'+(process.argv[2]||'6')+'.dsa',src.slice(0,src.indexOf('    // TEST_ENTRY_POINT'))+body);

