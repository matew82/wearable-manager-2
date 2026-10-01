// Run: node Tests/run.cjs (Node.js 20+ and Git; no DAZ instance is launched).
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.test-output'),baseline=path.join(output,'baseline');
fs.mkdirSync(baseline,{recursive:true});
const engines=require('./support/extract.cjs').files;
const files=[...engines,'Wearables Manager User Guide.dsa'];
let git='git';
if(cp.spawnSync(git,['--version'],{encoding:'utf8',windowsHide:true}).status!==0){git='C:\Program Files\Git\cmd\git.exe';}
const baselineCommit='1d15974476ccecaa30f8fe690a9bee6e991194bc';
for(const file of files){
  const r=cp.spawnSync(git,['show',baselineCommit+':'+file],{cwd:root,windowsHide:true,maxBuffer:4*1024*1024});
  if(r.status!==0)throw new Error('Cannot read baseline '+file+': '+r.stderr);
  fs.writeFileSync(path.join(baseline,file),r.stdout);
  new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
}
const suites=[
 ['integration.cjs','--source-root',root],
 ['storage/regressions.cjs','--sourceRoot',root,'--expect','after'],
 ['graph/regressions.cjs','--source-root',root,'--mode','source','--output',path.join(output,'graph-results.json')],
 ['graph/ownership.cjs','--source-root',root,'--mode','source','--output',path.join(output,'ownership-results.json')],
 ['controls/regressions.cjs','--source-root',root],
 ['help/regressions.cjs',path.join(root,'Wearables Manager User Guide.dsa')]
];
const receipt={baselineCommit,sourceRoot:root,nativeDAZ:false,syntaxFiles:files,suites:[]};
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
