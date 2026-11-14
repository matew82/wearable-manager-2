// Load the actual shared product module into an already-created mock context.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function install(context,root){vm.runInContext(fs.readFileSync(path.join(root,'Resources/Wearable Manager Support.dsa'),'utf8'),context,{filename:'Wearable Manager Support.dsa'});context.oWM2Config=context.WM2Support.defaults();}
module.exports={install};
