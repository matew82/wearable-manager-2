const fs=require('fs');const root=process.cwd().replaceAll('\\','/');
let s=fs.readFileSync('Wearable Manager Wardrobe.dsa','utf8');s=s.slice(0,s.indexOf('    // TEST_ENTRY_POINT'));
s+=`
var testLines=[];log=function(level,code,message){testLines.push(level+" "+code+" "+message);};
function check(v,m){if(!v)throw new Error(m);testLines.push("PASS "+m);}
try{
check(App.getContentMgr().openFile("D:/Tests/Main DAZ 3D Library/People/Genesis 8 Female/Genesis 8.1 Basic Female.duf",true),"load real Genesis 8.1");
var all=Scene.getNodeList(),fig=null;for(var i=0;i<all.length;i++)if(String(all[i].getName())==="Genesis8_1Female")fig=all[i];check(!!fig,"figure found");
var originalRight=captureHandPose(fig,"right"),originalLeft=captureHandPose(fig,"left"),channels=handNativeChannels(fig,"right"),grasp=null,thumb=null,bend=null;
for(i=0;i<channels.length;i++){var r=channels[i].record;if(r.propertyName==="pCTRLrHandGrasp")grasp=channels[i].property;if(r.propertyName==="pCTRLrThumbFist")thumb=channels[i].property;if(r.propertyNodePath[r.propertyNodePath.length-1]==="rIndex1"&&r.propertyName==="ZRotate")bend=channels[i].property;}
check(!!grasp&&!!thumb,"figure-level hand Pose Controls captured");check(channels.length>100,"hand and finger transform channels captured");
grasp.setValue(.47);thumb.setValue(.27);if(bend)bend.setValue(12);var poseA=captureHandPose(fig,"right"),posedValues=transformValues(all.filter(function(n){return String(n.getName())==="rIndex1";})[0]);
writeHandPose(fig,"right",originalRight);grasp.setValue(.13);var baseline=captureHandPose(fig,"right");
var a=prepareHandTransition({handPoses:{right:poseA}},fig);applyHandTransition(a,fig);
check(closeNumbers(captureHandPose(fig,"right"),poseA),"saved raw pose restored without ERC doubling");
check(closeNumbers(transformValues(all.filter(function(n){return String(n.getName())==="rIndex1";})[0]),posedValues),"evaluated finger pose matches capture");
check(closeNumbers(captureHandPose(fig,"left"),originalLeft),"opposite hand unchanged");
var poseB=clonePlain(poseA);for(i=0;i<poseB.channels.length;i++)if(poseB.channels[i].propertyName==="pCTRLrHandGrasp")poseB.channels[i].rawValue=.66;
applyHandTransition(prepareHandTransition({handPoses:{right:poseB}},fig),fig);
check(closeNumbers(Number(grasp.getRawValue()),.66),"second set pose applied");
applyHandTransition(prepareHandTransition({},fig),fig);check(closeNumbers(captureHandPose(fig,"right"),baseline),"set without pose restores initial session baseline");check(Object.keys(handPoseSession).length===0,"restored baseline released");
var bad=clonePlain(poseA);bad.channels[0].propertyName="missing_hand_channel";var failed=false;try{prepareHandTransition({handPoses:{right:bad}},fig);}catch(e){failed=true;}check(failed&&closeNumbers(captureHandPose(fig,"right"),baseline),"missing channel blocked before changes");
var tx=prepareHandTransition({handPoses:{right:poseA,left:originalLeft}},fig);tx.touched=true;writeHandPose(fig,"right",poseA);rollbackHandTransition(tx,fig);check(closeNumbers(captureHandPose(fig,"right"),baseline),"failed transition rollback restores original pose");
applyHandTransition(prepareHandTransition({handPoses:{right:poseA}},fig),fig);handPoseSession={};applyHandTransition(prepareHandTransition({},fig),fig);check(closeNumbers(captureHandPose(fig,"right"),poseA),"closing session commits current pose without restoration");
check(Object.keys(validateHandPoses(undefined)).length===0,"legacy sets have no hand pose");
}catch(e){testLines.push("FAIL "+errorText(e));}
var f=new DzFile(${JSON.stringify(root+'/.test-output/hand-native-')}+parseInt(App.versionString,10)+".txt");f.open(DzFile.WriteOnly);f.writeLine(testLines.join("\\n"));f.close();App.delayedExit(0);
})();`;
fs.writeFileSync('.test-output/hand-native.dsa',s);
