const files=["Wearables Manager Full.dsa","Wearables Manager Menu.dsa","Wearables Manager Take Off.dsa","Wearables Manager Put On.dsa"];
function getFunction(src,name) {
  const m = new RegExp('^([ \\t]*)function '+name+'\\(', 'm').exec(src);
  if(!m) throw new Error('Missing function '+name);
  const end = new RegExp('^'+m[1]+'}[^\\n]*','gm'); end.lastIndex=m.index+m[0].length;
  const e=end.exec(src); if(!e) throw new Error('Missing function end '+name);
  return {start:m.index,end:e.index+e[0].length,text:src.slice(m.index,e.index+e[0].length)};
}
module.exports={files,getFunction};
