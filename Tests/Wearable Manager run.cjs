const baselineHashes={"Wearable Manager Full.dsa":"e848612c0206f35e2cc8db36f769f949dab10784725218d38a63032a44c5a6ec","Wearable Manager Menu.dsa":"adb38dfe1ebeff2db4e3b25c376143c4d9cce9bb5348bb62c30065ba206fca6f","Wearable Manager Put On.dsa":"fc176fb20120fe1db01fe04dca1f3c9102a81e8689dc8d3b40a92ffc348a04b9","Wearable Manager Take Off.dsa":"c56ce119cec097433cfd7a2858888dd9896e831138e72a4f20851a7fb99c25d2","Wearable Manager User Guide.dsa":"a12d6953d95ae8261135f2f98c0fc0caca2fef597db49c06ae2d3dd7c004a82d"};
// Run: node Tests/Wearable Manager run.cjs [--baseline-root <verified original scripts>] (Node.js 20+; no DAZ instance is launched).
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.test-output'),baseline=path.join(output,'baseline');
const args=process.argv.slice(2);
if(args.length && (args.length!==2 || args[0]!=='--baseline-root'))throw Error('Usage: node Tests/Wearable Manager run.cjs [--baseline-root <verified original scripts>]');
const baselineRoot=args.length?path.resolve(args[1]):null;
fs.mkdirSync(baseline,{recursive:true});
const engines=require('./support/Wearable Manager extract.cjs').files;
const files=[...engines,'Wearable Manager User Guide.dsa'];
const settingsFiles=['Wearable Manager Icon Rules.dsa','Wearable Manager Supported Figures.dsa','Resources/Wearable Manager Support.dsa','Resources/Wearable Manager Settings UI.dsa'];
let git='git';
if(!baselineRoot && cp.spawnSync(git,['--version'],{encoding:'utf8',windowsHide:true}).status!==0){git='C:/Program Files/Git/cmd/git.exe';}
const baselineCommit='1d15974476ccecaa30f8fe690a9bee6e991194bc';
for(const file of files){
  let bytes;
  const originalFile=file.replace(/^Wearable Manager /,'Wearables Manager ');
  if(baselineRoot)bytes=fs.readFileSync(path.join(baselineRoot,originalFile));
  else{
   const r=cp.spawnSync(git,['show',baselineCommit+':'+originalFile],{cwd:root,windowsHide:true,maxBuffer:4*1024*1024});
   if(r.status!==0)throw new Error('Cannot read baseline '+file+': '+r.stderr);
   bytes=r.stdout;
  }
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==baselineHashes[file])throw Error('Baseline hash mismatch: '+file);
  fs.writeFileSync(path.join(baseline,file),bytes);
  new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
}
for(const file of settingsFiles)new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
const suites=[
 ['features/Wearable Manager wardrobe-bridge.cjs'],
 ['features/Wearable Manager wardrobe-read-scope.cjs'],
 ['features/Wearable Manager startup.cjs'],
 ['features/Wearable Manager restore-prompt.cjs'],
 ['features/Wearable Manager fitted-parent.cjs'],
 ['features/Wearable Manager transfer-reset.cjs'],
 ['features/Wearable Manager fitted-scale.cjs'],
 ['features/Wearable Manager wardrobe-launch.cjs'],
 ['features/Wearable Manager polish.cjs'],
 ['graph/Wearable Manager launch-modifiers.cjs','--source-root',root,'--original-root',baseline,'--output',path.join(output,'launch-modifier-results.json')],
 ['features/Wearable Manager config.cjs',path.join(root,'Resources/Wearable Manager Support.dsa'),path.join(output,'features-config.json')],
 ['features/Wearable Manager icons.cjs','--source-root',root,'--support-source',path.join(root,'Resources/Wearable Manager Support.dsa'),'--integrated'],
 ['features/Wearable Manager figures.cjs','--factory',path.join(root,'Resources/Wearable Manager Support.dsa'),'--output',path.join(output,'features-figures.json')],
 ['features/Wearable Manager protection.cjs','--source-root',root],
 ['features/Wearable Manager figure-ui.cjs','--source-root',root],
 ['features/Wearable Manager figure-entry.cjs','--sourceRoot',root],
 ['features/Wearable Manager ui.cjs'],
 ['features/Wearable Manager icon-layout.cjs','--source-root',root],
 ['features/Wearable Manager menu-preview.cjs'],
 ['features/Wearable Manager asset-icons.cjs'],
 ['features/Wearable Manager icon-import.cjs'],
 ['features/Wearable Manager integration.cjs','--source-root',root,'--output',path.join(output,'features-integration.json')],
 ['Wearable Manager integration.cjs','--source-root',root],
 ['storage/Wearable Manager regressions.cjs','--sourceRoot',root,'--expect','after'],
 ['graph/Wearable Manager regressions.cjs','--source-root',root,'--mode','source','--output',path.join(output,'graph-results.json')],
 ['graph/Wearable Manager registration.cjs','--source-root',root,'--output',path.join(output,'registration-results.json')],
 ['graph/Wearable Manager ownership.cjs','--source-root',root,'--mode','source','--output',path.join(output,'ownership-results.json')],
 ['graph/Wearable Manager aliases.cjs','--source-root',root,'--output',path.join(output,'alias-results.json')],
 ['storage/Wearable Manager aliases.cjs','--sourceRoot',root,'--expect','after'],
 ['controls/Wearable Manager regressions.cjs','--source-root',root],
 ['help/Wearable Manager regressions.cjs',path.join(root,'Wearable Manager User Guide.dsa')]
];
const receipt={baselineCommit,baselineRoot,baselineHashesVerified:true,sourceRoot:root,nativeDAZ:false,syntaxFiles:[...files,...settingsFiles],suites:[]};
for(const [name,...args] of suites){
 const r=cp.spawnSync(process.execPath,[path.join(__dirname,name),...args],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
 const outputStem=name.replace(/[/\\]/g,'-').replace(/\.cjs$/,'');
 fs.writeFileSync(path.join(output,outputStem+'.stdout.txt'),r.stdout||'');
 fs.writeFileSync(path.join(output,outputStem+'.stderr.txt'),r.stderr||'');
 let report;try{report=JSON.parse(r.stdout);}catch{}
 receipt.suites.push({name,exitCode:r.status,passed:report?.passed??report?.pass,failed:report?.failed??report?.fail??(r.status===0?0:1),skipped:report?.skip??0});
 if(r.status!==0){process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exitCode=1;}
}
receipt.passed=receipt.suites.reduce((n,s)=>n+(s.passed||0),0);
receipt.failed=receipt.suites.reduce((n,s)=>n+(s.failed||0),0);
receipt.skipped=receipt.suites.reduce((n,s)=>n+(s.skipped||0),0);
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt,null,2));
