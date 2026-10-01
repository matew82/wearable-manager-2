// Read-only audit harness: executes the supplied control class with isolated DAZ mocks.
// This does not load DAZ, touch installed scripts, or change the supplied source copies.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../../source-text');
const report = [];

function Color(r, g, b, a = 255) {
  if (r === 'black') [r, g, b] = [0, 0, 0];
  Object.assign(this, {red:r, green:g, blue:b, alpha:a, value:Math.max(r,g,b)});
}
const rgb = c => [c.red, c.green, c.blue];
function load(file) {
  const bytes = fs.readFileSync(path.join(root,file));
  const source = bytes.toString('utf8');
  const start = source.indexOf('function TagImageManagerClass(');
  const end = source.indexOf('function WearablesManagerClass(', start);
  assert(start >= 0 && end > start);
  const checkboxes = [];
  let dialogPlan = {accept:true, states:[]};
  const errors = [], propertyWrites = [], undoCalls = [];
  function Widget(){ this.minimumSizeHint = {height:20}; }
  Object.assign(Widget.prototype, {setFixedHeight(){},setFixedSize(){},addSpacing(){},addWidget(){}});
  function Dialog(){this.widget = new Widget();}
  Object.assign(Dialog.prototype, {
    getWidget(){return this.widget;},showHelpButton(){},showCancelButton(){},showAcceptButton(){},addWidget(){},setFixedSize(){},
    exec(){
      for(let i=0;i<checkboxes.length;i++) {
        if(i in dialogPlan.states) checkboxes[i].callback.call(checkboxes[i],dialogPlan.states[i]);
      }
      return dialogPlan.accept;
    }
  });
  function BoxLayout(){return new Widget();}
  BoxLayout.TopToBottom = 0;
  const sandbox = {
    Color, DATA_ITEM_NAME:'MatewWearables', VALUE_EMISSIVE:'Emissive',
    DzSceneHelper(){return {
      findPropertyOnMaterial(name,material){return material.props[name] || null;},
      findPropertyByInternalName(name,node){return node.props[name] || null;}
    };},
    DzSimpleElementData:function(name){this.name=name;const settings={};this.getSettings=()=>({getStringValue:(k,d)=>settings[k]??d,setStringValue:(k,v)=>settings[k]=v});},
    DzBasicDialog:Dialog,DzVGroupBox:Widget,DzHGroupBox:Widget,DzBoxLayout:BoxLayout,Font:Widget,
    DzCheckBox:function(){checkboxes.push(this);},
    connect(sender,signal,receiver,callback){sender.callback=callback;},
    err(message){errors.push(message);},
    beginUndo(){undoCalls.push('begin');},acceptUndo(){undoCalls.push('accept');},cancelUndo(){undoCalls.push('cancel');}
  };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(start,end),sandbox,{filename:file});
  const manager = new sandbox.TagImageManagerClass({elementID:100});
  manager.iUpdateTagIcon = () => {};
  manager.iGetPixmapByIconName = name => name;
  function node(materials,initialTag) {
    const tags = {};
    const n = {
      elementID:1,props:{}, getLabel(){return 'Mock wearable';},
      findDataItem(name){return tags[name] || null;},addDataItem(item){tags[item.name]=item;},
      getObject(){return {getCurrentShape(){return {getAllMaterials(){return materials;}};}};},
      inherits(){return false;}
    };
    if(initialTag !== undefined) {
      const d = new sandbox.DzSimpleElementData('MatewWearables');
      d.getSettings().setStringValue('Emissive',initialTag);n.addDataItem(d);
    }
    return n;
  }
  function material(name,color) {
    const prop = {color,getColorValue(){return this.color;},setColorValue(value){propertyWrites.push({material:name,value:rgb(value)});this.color=value;}};
    return {name,props:{'Emission Color':prop}};
  }
  function plan(accept,states){checkboxes.length=0;dialogPlan={accept,states};}
  return {file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),source,manager,node,material,plan,errors,propertyWrites,undoCalls};
}


// for(const file of ['Wearables Manager Full.dsa'
