const fs=require('fs'),root=process.cwd().replaceAll('\\','/'),lib='D:/Tests/Main DAZ 3D Library/Presets/matew/WardrobeSetsPrototype',dest=root+'/.test-output/undo-hand-library-'+(process.argv[2]||'6')+'-'+Date.now();
fs.mkdirSync(dest+'/Catalog',{recursive:true});fs.mkdirSync(dest+'/Logs',{recursive:true});fs.copyFileSync(lib+'/library.json',dest+'/library.json');const rev=fs.readdirSync(lib+'/Catalog').filter(n=>n.startsWith('rev_')).sort().pop();fs.copyFileSync(lib+'/Catalog/'+rev,dest+'/Catalog/'+rev);for(const dir of ['Items','Materials'])if(fs.existsSync(lib+'/'+dir))fs.cpSync(lib+'/'+dir,dest+'/'+dir,{recursive:true});
const src=fs.readFileSync('Wearable Manager Wardrobe.dsa','utf8');let body=`
var output=new DzFile(${JSON.stringify(root+'/.test-output/undo-hand-')}+parseInt(App.versionString,10)+'.txt');output.open(DzFile.WriteOnly);
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

run('apply',{id:sword.id});
var savedHands=clonePlain(sword.handPoses),differentHand=captureHandPose(fig,'right');
for(var dhi=0;dhi<differentHand.channels.length;dhi++)if(differentHand.channels[dhi].propertyName==='pCTRLrHandFist')differentHand.channels[dhi].rawValue=0.17;
writeHandPose(fig,'right',differentHand);
run('save',{id:sword.id,name:sword.name,scope:'type',items:sword.items.slice(0),nodes:[],properties:[],rightHandPose:true,leftHandPose:!!savedHands.left});
assertTest(closeNumbers(app.db.sets[sword.id].handPoses,savedHands),'unrelated Save Set preserves stored hand poses while scene differs');
run('apply',{id:sword.id});
var channels=handNativeChannels(fig,'left'),posed=0;
for(var hi=0;hi<channels.length;hi++){var hp=channels[hi].property,hr=channels[hi].record;if(hr.propertyGroupPath.toLowerCase().indexOf('pose controls')>=0&&/fist/i.test(hr.propertyName)&&!hp.isLocked()){hp.setValue(0.25);posed++;}}
assertTest(posed>0,'left-hand Pose Controls authored');
run('save',{id:sword.id,name:sword.name,scope:'type',items:sword.items.slice(0),nodes:[],properties:[],rightHandPose:true,leftHandPose:true});
cycle('undress_all',{});cycle('apply',{id:sword.id});
var one=snap();run('undress_all',{});run('apply',{id:sports.id});var three=snap();
function settle(){Scene.update();processEvents();sleep(250);processEvents();invalidateReadScope();}
assertTest(UndoStack.undo(),'history undo 1');settle();assertTest(UndoStack.undo(),'history undo 2');settle();assertTest(closeNumbers(one,snap()),'two-step Undo restores both hands and metadata');
assertTest(UndoStack.redo(),'history redo 1');settle();assertTest(UndoStack.redo(),'history redo 2');settle();assertTest(closeNumbers(three,snap()),'two-step Redo restores both hands and metadata');
assertTest(UndoStack.undo(),'branch undo');settle();run('apply',{id:sword.id});assertTest(!UndoStack.redo(),'new action replaces Redo branch');cycle('undress_all',{});cycle('apply',{id:sword.id});
emit('PASS MATRIX COMPLETE');
}catch(e){emit('FAIL '+errorText(e));}finally{output.close();App.delayedExit(0);}
})();`;
fs.writeFileSync('.test-output/undo-hand'+(process.argv[2]||'6')+'.dsa',src.slice(0,src.indexOf('    // TEST_ENTRY_POINT'))+body);

