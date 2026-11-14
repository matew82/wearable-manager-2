'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../../Resources/Wearable Manager Property UI.dsa'),'utf8');
let widgets=[],loaded=[],writes=0,drawFailure=false,imageCount=0;
class W{constructor(parent){this.parent=parent;this.font={pointSize:10};this.min=-1e6;this.max=1e6;this.value=0;widgets.push(this);}hide(){this.hidden=true;}deleteLater(){this.deleted=true;}setFixedHeight(n){this.height=n;}setFixedSize(w,h){this.width=w;this.height=h;}getWidget(){return this;}setStyleSheet(s){this.style=s;}addWidget(w){(this.children||(this.children=[])).push(w);}}
class Img{constructor(w,h){imageCount++;this.width=w||100;this.height=h||80;}load(p){loaded.push(p);return p!=='bad';}isNull(){return false;}smoothScale(w,h){return new Img(w,h);}setPixel(){}drawText(){if(drawFailure)throw Error('draw failure');}}
Img.Format_RGB32=1;
class Pix{fromImage(i){this.image=i;}isNull(){return false;}}
class F{constructor(f){Object.assign(this,f);}size(){return{height:18,width:100};}elidedText(s){return s;}}
const env={DzWidget:W,DzHBoxLayout:W,DzVBoxLayout:W,DzLabel:W,DzFloatSlider:W,DzIntSlider:W,Image:Img,Pixmap:Pix,Font:F,Color:function(r,g,b){this.red=r;this.green=g;this.blue=b;},DzFileInfo:class{exists(){return true;}isFile(){return true;}},App:{getContentMgr(){return{};}}};
vm.createContext(env);vm.runInContext(source,env);
const UI=env.WM2PropertyUI;
function prop(extra={}){return Object.assign({getLabel:()=> 'Smile',getPresentation:()=>({iconSmall:'small',iconLarge:'large',colorA:{red:20,green:40,blue:60},colorB:{red:120,green:140,blue:160}}),inherits:n=>n==='DzNumericProperty'||n==='DzFloatProperty',getMin:()=>-1,getMax:()=>2,isClamped:()=>true,getDisplayAsPercent:()=>true,setValue(){writes++;}},extra);}
let pass=0;function test(name,fn){fn();pass++;console.error('PASS '+name);}
test('native metadata and percent',()=>{let m=UI.metadata(prop());assert.equal(m.percent,true);assert.equal(m.clamped,true);assert.equal(m.min,-1);assert.equal(m.max,2);assert.deepEqual(Array.from(m.colors[0]),[20,40,60]);});
test('two sliders raw units, no live writes',()=>{let c=UI.create(null,prop(),{sliders:true,applyValue:.75,resetValue:0});assert.equal(c.getApplyValue(),.75);assert.equal(c.getResetValue(),0);assert.equal(c.apply.displayAsPercent,true);assert.equal(c.apply.clamped,true);assert.equal(c.apply.min,-1);assert.equal(c.apply.max,2);assert.equal(writes,0);});
test('unclamped matches property',()=>{let c=UI.create(null,prop({isClamped:()=>false}),{sliders:true,applyValue:20,resetValue:-20});assert.equal(c.apply.clamped,false);assert.equal(c.getApplyValue(),20);});
test('summary without sliders',()=>{let c=UI.create(null,prop(),{sliders:false});assert.equal(c.apply,null);assert.equal(c.reset,null);assert(c.icon);assert(c.label.pixmap);});
test('broken small falls back to large',()=>{loaded=[];UI.create(null,prop({getPresentation:()=>({iconSmall:'bad',iconLarge:'large'})}),{});assert.deepEqual(loaded,['bad','large']);});
test('unavailable raster leaves text',()=>{drawFailure=true;let c=UI.create(null,prop(),{});assert.equal(c.label.text,'Smile');drawFailure=false,imageCount=0;});
test('boolean rejected',()=>assert.equal(UI.isNumeric(prop({inherits:n=>n==='DzBoolProperty'||n==='DzNumericProperty'})),false));
test('enum rejected',()=>assert.equal(UI.isNumeric(prop({inherits:n=>n==='DzEnumProperty'||n==='DzNumericProperty'})),false));
test('integer constraints',()=>{let p=prop({inherits:n=>n==='DzIntProperty'||n==='DzNumericProperty'});assert.throws(()=>UI.create(null,p,{sliders:true,applyValue:1.5,resetValue:0}));let c=UI.create(null,p,{sliders:true,applyValue:1,resetValue:0});assert.equal(c.apply.sensitivity,1);});
test('no presentation still label',()=>{let c=UI.create(null,prop({getPresentation:()=>null}),{});assert.equal(c.label.text,'Smile');assert.equal(c.icon,null);});
test('missing bounds and nonfinite refuse',()=>assert.throws(()=>UI.create(null,prop(),{sliders:true,applyValue:NaN,resetValue:0})));
test('failed construction cleans only partial root',()=>{let start=widgets.length;assert.throws(()=>UI.create(null,prop(),{sliders:true,applyValue:NaN,resetValue:0}));assert(widgets[start].hidden&&widgets[start].deleted);});
test('cards do not share mutable image backgrounds',()=>{let a=UI.create(null,prop(),{}),b=UI.create(null,prop(),{});assert.notEqual(a.label.pixmap,b.label.pixmap);});
test('deferred creation performs no pixel or disk load',()=>{loaded=[];imageCount=0;let c=UI.create(null,prop(),{deferArtwork:true});assert.equal(imageCount,0);assert.deepEqual(loaded,[]);assert.equal(c.icon.width,91);assert.equal(c.icon.pixmap,undefined);assert.equal(c.label.text,'Smile');assert.equal(c.label.pixmap,undefined);assert.equal(c.widget.height,91);});
test('deferred refresh is one-shot and retains native refs',()=>{loaded=[];imageCount=0;let c=UI.create(null,prop(),{deferArtwork:true}),n=c.refs.length,label=c.label;assert.equal(c.refreshArtwork(),true);assert(c.icon.pixmap&&label.pixmap);assert.equal(c.label,label);assert(c.refs.length>n);let count=imageCount;assert.equal(c.refreshArtwork(),false);assert.equal(imageCount,count);assert.deepEqual(loaded,['small']);});
test('eager refresh is a no-op',()=>{let c=UI.create(null,prop(),{}),n=imageCount;assert.equal(c.refreshArtwork(),false);assert.equal(imageCount,n);});
test('disposed deferred card does not load',()=>{loaded=[];let c=UI.create(null,prop(),{deferArtwork:true});c.dispose();assert.equal(c.refreshArtwork(),false);assert.deepEqual(loaded,[]);});
test('deferred icon failure uses large fallback',()=>{loaded=[];let c=UI.create(null,prop({getPresentation:()=>({iconSmall:'bad',iconLarge:'large'})}),{deferArtwork:true});assert.deepEqual(loaded,[]);c.refreshArtwork();assert.deepEqual(loaded,['bad','large']);assert(c.icon.pixmap);});
test('deferred missing image removes empty placeholder',()=>{let c=UI.create(null,prop({getPresentation:()=>({iconSmall:'bad',iconLarge:'bad'})}),{deferArtwork:true});c.refreshArtwork();assert(c.icon.hidden);assert.equal(c.widget.height,32);assert.equal(c.label.text,'Smile');});
test('deferred text failure preserves readable title',()=>{let c=UI.create(null,prop(),{deferArtwork:true});drawFailure=true;c.refreshArtwork();drawFailure=false;assert.equal(c.label.text,'Smile');});
test('deferred values available before artwork',()=>{let c=UI.create(null,prop(),{deferArtwork:true,sliders:true,applyValue:.5,resetValue:0});assert.equal(c.getApplyValue(),.5);assert.equal(c.getResetValue(),0);c.refreshArtwork();assert.equal(c.getApplyValue(),.5);assert.equal(writes,0);});
console.log(JSON.stringify({passed:pass,failed:0}));

