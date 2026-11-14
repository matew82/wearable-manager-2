const fs=require('fs'),root=process.cwd().replaceAll('\\','/'),lib='D:/Tests/Main DAZ 3D Library/Presets/matew/WardrobeSetsPrototype',dest=root+'/.test-output/undo-material-library-'+(process.argv[2]||'6')+'-'+Date.now();
fs.mkdirSync(dest+'/Catalog',{recursive:true});fs.mkdirSync(dest+'/Logs',{recursive:true});fs.copyFileSync(lib+'/library.json',dest+'/library.json');const rev=fs.readdirSync(lib+'/Catalog').filter(n=>n.startsWith('rev_')).sort().pop();fs.copyFileSync(lib+'/Catalog/'+rev,dest+'/Catalog/'+rev);for(const dir of ['Items','Materials'])if(fs.existsSync(lib+'/'+dir))fs.cpSync(lib+'/'+dir,dest+'/'+dir,{recursive:true});
const src=fs.readFileSync('Wearable Manager Wardrobe.dsa','utf8');let body=`
var output=new DzFile(${JSON.stringify(root+'/.test-output/undo-material-')}+parseInt(App.versionString,10)+'.txt');output.open(DzFile.WriteOnly);
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

run('apply',{id:sports.id});var red=app.db.sets['matew_set_mv657yf0_4_awhsml'];
run('save',{id:red.id,name:red.name,scope:'label',scopeLabel:'Fred 8.1',items:sports.items.slice(0),nodes:[],properties:[],materialRequests:sports.items.map(function(id){return {itemID:id};})});
var ri=inventory(fig,app.db)[sports.items[0]].root,mp=ri.getObject().getCurrentShape().getMaterial(0).findProperty('Cutout Opacity');assertTest(!!mp,'native opacity fixture');mp.setValue(0.75);
cycle('restore_materials',{id:red.id,commitID:app.db.commitID,itemIDs:sports.items.slice(0)});
emit('PASS MATRIX COMPLETE');
}catch(e){emit('FAIL '+errorText(e));}finally{output.close();App.delayedExit(0);}
})();`;
fs.writeFileSync('.test-output/undo-material'+(process.argv[2]||'6')+'.dsa',src.slice(0,src.indexOf('    // TEST_ENTRY_POINT'))+body);

