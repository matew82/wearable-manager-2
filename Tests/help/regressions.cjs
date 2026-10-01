// Execute exact original/proposed guide scripts with memory-only DAZ mocks.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const original = fs.readFileSync(path.resolve(__dirname, '../../.test-output/baseline/Wearables Manager User Guide.dsa'),'utf8');
const proposalFile = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname,'Wearables Manager User Guide.proposed.dsa');
const proposed = fs.readFileSync(proposalFile,'utf8');
const pdf = 'Wearables Manager User Guide.pdf';
const originalRelative = 'Scripts/matew/Wearables Manager/' + pdf;
const results = [];
new vm.Script(proposed, {filename:proposalFile});

function run(script, options = {}) {
  const calls = [];
  const scriptPath = options.scriptPath || 'D:/Tests/DAZ Test Folder/Scripts/matew/Wearables Manager 2/Wearables Manager User Guide.dsa';
  const local = scriptPath.replace(/\\/g,'/').replace(/\/[^/]*$/,'/' + pdf);
  const mgr = {
    getMappedPath(...args) { calls.push({method:'getMappedPath',args}); return 'mock/base'; },
    getAbsolutePath(...args) { calls.push({method:'getAbsolutePath',args}); return options.mapped || ''; }
  };
  function DzFileInfo(file) {
    this.path = () => String(file).replace(/\\/g,'/').replace(/\/[^/]*$/,'');
    this.exists = () => String(file) === local && options.localExists !== false;
    this.isReadable = () => options.localReadable !== false;
    if (!options.pre493) this.isFile = () => !options.localDirectory;
    this.deleteLater = () => {};
  }
  const context = vm.createContext({DzFileInfo, getScriptFileName:()=>scriptPath, DzContentMgr:{AllDirs:1,AllDirsAndCloud:2}, App:{version64:options.version64 || 0x0006000000000000,getContentMgr:()=>{calls.push({method:'getContentMgr'});return options.noContentMgr ? null : mgr;},showURL:url=>calls.push({method:'showURL',url})}, MessageBox:{information:(...args)=>calls.push({method:'information',args})}});
  vm.runInContext('String.prototype.isEmpty = function(){return this.length === 0;}; String.prototype.arg = function(value){return this.replace("%1",value);};',context);
  vm.runInContext(script,context);
  return {calls,local,url:calls.find(c=>c.method==='showURL')?.url};
}
function check(name, options, verify) {
  const outcome = run(proposed, options);
  verify(outcome);
  results.push({test:name,result:'passed',calls:outcome.calls});
}

const originalRenamed = run(original,{mapped:'C:/Old Library/' + originalRelative});
assert(originalRenamed.url.includes('Old Library'));
results.push({test:'Original renamed-folder behavior',result:'opens mapped original copy, ignoring sibling PDF',calls:originalRenamed.calls});
check('Sibling PDF wins over another mapped product copy',{mapped:'C:/Old Library/' + originalRelative},o=>{assert(o.url.includes('Wearables%20Manager%202'));assert(!o.calls.some(c=>c.method==='getContentMgr'));});
check('Sibling opens with unavailable content manager',{noContentMgr:true},o=>assert(o.url));
check('Unreadable sibling falls back to mapped path',{localReadable:false,mapped:'C:/Old Library/' + originalRelative},o=>assert(o.url.includes('Old%20Library')));
check('Directory named .pdf does not replace a PDF',{localDirectory:true,mapped:'C:/Old Library/' + originalRelative},o=>assert(o.url.includes('Old%20Library')));
check('Older FileInfo surface without isFile still resolves readable sibling',{pre493:true,version64:0x0004000800010032},o=>assert(o.url));
for (const version64 of [0x0004000800010032,0x0004000800010033,0x0004000900000033,0x0006000000000000]) {
  check('Mapped fallback version ' + version64,{localExists:false,mapped:'C:/Content/' + originalRelative,version64},o=>{
    const call = o.calls.find(c=>c.method==='getAbsolutePath');
    assert(call);
    assert.strictEqual(call.args[0],version64 < 0x0004000800010033 ? originalRelative : version64 < 0x0004000900000033 ? 1 : 2);
  });
}
check('Missing PDF shows existing information dialog',{localExists:false},o=>{assert(!o.url);assert(o.calls.some(c=>c.method==='information'));});
check('No content manager and missing sibling shows information dialog',{localExists:false,noContentMgr:true},o=>assert(o.calls.some(c=>c.method==='information')));
for (const scriptPath of [
  'C:/Daz #Library/WM2/Guide.dsa',
  'C:/Daz %23 Library/WM2/Guide.dsa',
  'C:/Daz ? Library/WM2/Guide.dsa',
  'C:/Daz Ukrainian \u041c\u043e\u044f/WM2/Guide.dsa',
  'C:\\Daz #Library\\WM2\\Guide.dsa',
  '//server/Share #One/WM2/Guide.dsa',
  '\\\\server\\Share #One\\WM2\\Guide.dsa',
  '/Users/me/Daz #Library/WM2/Guide.dsa'
]) {
  check('File URI path roundtrip: ' + scriptPath,{scriptPath},o=>{
    const parsed = new URL(o.url);
    assert.strictEqual(parsed.search,'');
    assert.strictEqual(parsed.hash,'');
    const reconstructed = (parsed.hostname ? '//' + parsed.hostname : '') + decodeURIComponent(parsed.pathname).replace(/^\/(?=[A-Za-z]:\/)/,'');
    assert.strictEqual(reconstructed,o.local);
  });
}
const oldSpecial = run(original,{localExists:false,mapped:'C:/Daz #Library/' + originalRelative});
assert(new URL(oldSpecial.url).hash);
results.push({test:'Original special-path behavior',result:'unescaped # becomes URL fragment in standard parser',uri:oldSpecial.url});
console.log(JSON.stringify({proposalFile,validation:'Pure mocks and modern JS syntax; native DAZ/OS launch unverified',passed:results.filter(r=>r.result==='passed').length,results},null,2));
