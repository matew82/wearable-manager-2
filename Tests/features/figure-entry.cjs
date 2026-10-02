'use strict';
// Focused source-extracted entry/transfer regressions. No DAZ, file writes or receipts.
// Transaction, snapshot, editor and restore services are bounded contract mocks;
// actual Support, eligibility, owner lookup, nested guard and move boundary run here.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const {files, getFunction} = require('../support/extract.cjs');
const args = process.argv.slice(2), sourceIndex = args.indexOf('--sourceRoot');
const sourceRoot = path.resolve(sourceIndex >= 0 ? args[sourceIndex + 1] : path.join(__dirname, '../..'));
const supportSource = fs.readFileSync(path.join(sourceRoot, 'Resources/WM2 Support.dsa'), 'utf8');
const results = [];
function test(name, run) {
    try { run(); results.push({name, pass:true}); }
    catch (error) { results.push({name, pass:false, error:String(error)}); }
}
function world() {
    let next = 0;
    const nodes = [];
    function node(name, type) {
        const value = {
            name, elementID:++next, children:[], parent:null, follow:null,
            className:() => type,
            inherits(kind) { return kind === 'DzNode' || kind === type || (type === 'DzFigure' && kind === 'DzSkeleton'); },
            getLabel() { return this.name; }, getName() { return this.name; },
            getFollowTarget() { return this.follow; },
            getNodeParent() { return this.parent; },
            getNodeChildren(recursive) {
                return this.children.reduce((list, child) => list.concat(child, recursive ? child.getNodeChildren(true) : []), []);
            },
            addNodeChild(child) {
                if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
                this.children.push(child); child.parent = this;
            },
            findDataItem:() => null, getNumGraftFigures:() => 0, getGraftFigure:() => null
        };
        nodes.push(value); return value;
    }
    return {nodes, node};
}
function loadSupport(sandbox) {
    vm.createContext(sandbox);
    vm.runInContext(supportSource, sandbox, {filename:'WM2 Support.dsa'});
    sandbox.oWM2Config = sandbox.WM2Support.defaults();
}
function functions(source, sandbox, names) {
    for (const name of names) vm.runInContext(getFunction(source, name).text, sandbox, {filename:name});
}
function entryPrefix(source) {
    const main = source.indexOf('MAIN BLOCK');
    const start = source.indexOf('if (!CheckForAnotherProcessActive()) return;', main);
    const end = source.indexOf('SetStatusBusy();', start);
    assert(main >= 0 && start >= main && end >= start, 'Entry markers are present');
    return source.slice(start, end + 'SetStatusBusy();'.length);
}
function untilAccept(source, start) {
    const accept = source.indexOf('WM2AcceptUndo(', start), end = source.indexOf(';', accept);
    assert(start >= 0 && accept >= start && end > accept, 'Operation markers are present');
    return source.slice(start, end + 1);
}
function transferFixture(source) {
    const w = world(), owner = w.node('Genesis9', 'DzFigure');
    const shell = w.node('Genesis9Eyes', 'DzGeometryShellNode'), group = w.node('Storage', 'DzGroupNode');
    owner.addNodeChild(shell);
    const calls = {begin:0, create:0, snapshot:0, move:0, restore:0, accept:0, finish:0, finalize:0, notice:0};
    const sandbox = {
        Scene:{getNodeList:() => w.nodes}, oHumanFigure:owner, oGroup:null,
        bAltPressed:false, bUseTransferMark:true, bTransferByDefault:true,
        DATA_ITEM_NAME:'MatewWearables', SETTIGNS_TRANSFER:'Transfer', VALUE_TRANSFER_YES:'Yes', VALUE_TRANSFER_NO:'No',
        WM2SameNode:(a,b) => !!a && !!b && a.elementID === b.elementID,
        WM2BeginUndo:() => calls.begin++, WM2AcceptUndo:() => calls.accept++,
        WM2NoEligibleTransfers:() => calls.notice++,
        WM2CancelUndo:() => { throw Error('Unexpected cancel'); }, SetStatusFinished:() => calls.finish++,
        GetBelongingsGroup:(figure, create) => { assert.strictEqual(figure, owner); if(create) calls.create++; return group; },
        WM2SaveShellSnapshots:() => { calls.snapshot++; return true; },
        PlaceWearableIntoGroup:() => calls.move++, GetAllShells:() => [shell],
        WM2RestoreWearablePairs:(figure, storage, pairs) => { assert.strictEqual(figure, owner); assert(pairs.length > 0); calls.restore++; return true; },
        WM2RemoveEmptyStorageGroup:() => true,
        oRemoveQueue:{Clear:() => {}, Finalize:() => calls.finalize++}
    };
    loadSupport(sandbox);
    functions(source, sandbox, ['FilterParentedToHumanFigureAndNotAnExemption', 'IsParentedToHuman', 'GetDefaultTransferExemptionsList', 'FilterMarkedForTransferring', 'FilterShells']);
    return {w, owner, shell, group, sandbox, calls};
}
for (const filename of files) {
    const source = fs.readFileSync(path.join(sourceRoot, filename), 'utf8');
    for (const mode of ['cancel', 'saved', 'selectionChanged', 'becameBusy', 'stillUnsupported', 'nestedGuard']) {
        test(filename + ': unsupported entry ' + mode, () => {
            const w = world(), custom = w.node('CustomCreature', 'DzFigure'), other = w.node('Genesis8Female', 'DzFigure');
            if (mode === 'nestedGuard') custom.addNodeChild(w.node('Genesis9', 'DzFigure'));
            let selection = custom, checks = 0, busy = 0, errors = 0, editors = 0, reloads = 0, selectionReads = 0;
            const events = [];
            const sandbox = {
                PATH_ICONS:'/mock', Scene:{getNodeList:() => w.nodes, getPrimarySelection:() => { selectionReads++; events.push('selection'); return selection; }},
                CheckForAnotherProcessActive:() => { checks++; events.push('process'); return !(mode === 'becameBusy' && checks === 2); },
                SetStatusBusy:() => { busy++; events.push('busy'); }, err:() => { errors++; events.push('error'); }, FindBoundFigure:() => false
            };
            loadSupport(sandbox);
            const updated = sandbox.WM2Support.defaults(); updated.supportedFigures.push('CustomCreature');
            sandbox.WM2Support.load = () => { reloads++; events.push('reload'); return {config:mode === 'stillUnsupported' ? sandbox.WM2Support.defaults() : updated}; };
            sandbox.WM2ShowSupportedFigures = () => { editors++; events.push('editor'); if(mode === 'selectionChanged') selection = other; return {saved:mode !== 'cancel'}; };
            functions(source, sandbox, ['GetCurrentHumanFigure', 'IsNodeHumanFigure', 'GetAnotherHumanFigureParentedToTheCurrent']);
            vm.runInContext('function entry(){' + entryPrefix(source) + '\nreturn oHumanFigure;}', sandbox);
            const resolved = sandbox.entry();
            assert.strictEqual(editors, 1);
            assert.strictEqual(checks, mode === 'cancel' ? 1 : 2);
            assert.strictEqual(reloads, mode === 'cancel' ? 0 : 1);
            assert.strictEqual(busy, ['saved','selectionChanged'].includes(mode) ? 1 : 0);
            assert.strictEqual(errors, ['stillUnsupported','nestedGuard'].includes(mode) ? 1 : 0);
            if(mode === 'saved') assert.strictEqual(resolved, custom);
            if(mode === 'selectionChanged') assert.strictEqual(resolved, other);
            if(mode === 'becameBusy') assert.strictEqual(selectionReads, 1);
            if(busy) assert(events.indexOf('busy') > events.indexOf('reload'));
            assert(!/WM2BeginUndo\(|GetBelongingsGroup\(|WM2SaveShellSnapshots\(/.test(entryPrefix(source)), 'Onboarding precedes transaction/storage services');
        });
    }
    function guardedWorld(containerType = 'DzGroupNode') {
        const w = world(), owner = w.node('Genesis9', 'DzFigure'), container = w.node('AccessoryContainer', containerType);
        const eyes = w.node('Genesis9Eyes', 'DzNode'), group = w.node('Storage', 'DzGroupNode');
        owner.addNodeChild(container); container.addNodeChild(eyes);
        const writes = {metadata:0, parenting:0, fitTo:0};
        if(containerType === 'DzFigure') container.follow = owner;
        container.setFollowTarget = value => { writes.fitTo++; container.follow = value; };
        const sandbox = {
            Scene:{getNodeList:() => w.nodes}, oHumanFigure:owner, bAltPressed:true,
            WM2SameNode:(a,b) => !!a && !!b && a.elementID === b.elementID,
            WM2SceneContains:() => true, WM2IsBoneOfFigure:() => false,
            WM2NodeSettings:() => { writes.metadata++; throw Error('Unexpected metadata write'); },
            WM2ReviewAndAdoptLegacyProxy:() => ({ok:true,status:'not-proxy'}),
            ParentToBoneGroup:() => { writes.parenting++; throw Error('Unexpected parenting'); }
        };
        loadSupport(sandbox);
        functions(source, sandbox, ['FilterParentedToHumanFigureAndNotAnExemption','IsParentedToHuman','GetDefaultTransferExemptionsList','PlaceWearableIntoGroup','ReturnWearable']);
        return {owner, container, eyes, group, sandbox, writes};
    }
    test(filename + ': Alt cannot carry protected anatomy via ancestor', () => {
        const f = guardedWorld();
        assert.strictEqual(f.sandbox.FilterParentedToHumanFigureAndNotAnExemption.call(f.sandbox.GetDefaultTransferExemptionsList(f.owner), f.container), false);
    });
    test(filename + ': transfer boundary rejects before metadata/FitTo/parent writes', () => {
        const f = guardedWorld('DzFigure');
        assert.throws(() => f.sandbox.PlaceWearableIntoGroup(f.owner, f.container, f.group), /protected|ownership/i);
        assert.deepStrictEqual(f.writes, {metadata:0,parenting:0,fitTo:0});
        assert.strictEqual(f.container.follow, f.owner);
        assert.strictEqual(f.container.parent, f.owner); assert.strictEqual(f.eyes.parent, f.container);
    });
    test(filename + ': newly protected stored subtree remains restorable', () => {
        const f = guardedWorld(); f.group.addNodeChild(f.container);
        assert.strictEqual(f.sandbox.ReturnWearable(f.owner, f.container, f.group), true);
        assert.strictEqual(f.container.parent, f.owner); assert.strictEqual(f.eyes.parent, f.container);
    });
    const main = source.indexOf('MAIN BLOCK');
    const removeMarker = source.indexOf('<------------ Move wearables into group ------------->', main);
    if (removeMarker >= 0) test(filename + ': zero eligible direct removals have no storage/snapshot/Undo writes', () => {
        const f = transferFixture(source), start = source.indexOf('*/', removeMarker) + 2;
        vm.runInContext('function remove(){' + untilAccept(source,start) + '\n}', f.sandbox);
        f.sandbox.remove();
        assert.deepStrictEqual(f.calls, {begin:0,create:0,snapshot:0,move:0,restore:0,accept:0,finish:1,finalize:0,notice:1});
    });
    const dialogStart = source.indexOf('var arrAll = oWearablesManager.GetListsOfMovingWearables();', main);
    if (dialogStart >= 0) {
        for (const restore of [false,true]) test(filename + ': rejected dialog removals ' + (restore ? 'retain restoration' : 'have no side effects'), () => {
            const f = transferFixture(source);
            const stored = f.w.node('PreviouslyStoredEyes','DzNode'); f.group.addNodeChild(stored);
            f.sandbox.oGroup = f.group;
            f.sandbox.oWearablesManager = {GetListsOfMovingWearables:() => [[f.shell], restore ? [[stored,f.owner]] : []]};
            vm.runInContext('function apply(){' + untilAccept(source,dialogStart) + '\n}', f.sandbox);
            f.sandbox.apply();
            assert.strictEqual(f.calls.create, 0); assert.strictEqual(f.calls.snapshot, 0); assert.strictEqual(f.calls.move, 0);
            assert.strictEqual(f.calls.restore, restore ? 1 : 0);
            assert.strictEqual(f.calls.begin, restore ? 1 : 0); assert.strictEqual(f.calls.accept, restore ? 1 : 0);
            assert.strictEqual(f.calls.finalize, restore ? 1 : 0);
            assert.strictEqual(f.calls.notice, restore ? 0 : 1);
        });
    }
}
const menuSource = fs.readFileSync(path.join(sourceRoot, 'Wearables Manager Menu.dsa'), 'utf8');
for (const type of ['DzNode', 'DzGroupNode', 'customAttachment']) {
    for (const mode of ['cancel', 'stillUnsupported', 'selectionChanged', 'selectionCleared']) {
        test('Menu: unresolved ' + type + ' reaches setup before owner gate: ' + mode, () => {
            const w = world(), custom = w.node('CustomCreature', 'DzFigure'), known = w.node('Genesis9', 'DzFigure');
            let selection = w.node('UnresolvedSelection', type === 'customAttachment' ? 'DzNode' : type);
            if(type === 'customAttachment') custom.addNodeChild(selection);
            let editors = 0, busy = 0, errors = 0, checks = 0, reloads = 0, selectionReads = 0;
            const sandbox = {
                PATH_ICONS:'/mock', Scene:{getNodeList:() => w.nodes, getPrimarySelection:() => { selectionReads++; return selection; }},
                CheckForAnotherProcessActive:() => { checks++; return true; },
                SetStatusBusy:() => busy++, err:() => errors++, FindBoundFigure:() => false
            };
            loadSupport(sandbox);
            const originalConfig = JSON.stringify(sandbox.oWM2Config);
            sandbox.WM2Support.selectedFigure = () => { throw Error('Setup must precede this optional registration gate'); };
            sandbox.WM2Support.load = () => { reloads++; return {config:sandbox.WM2Support.defaults()}; };
            sandbox.WM2ShowSupportedFigures = () => {
                editors++;
                if(mode === 'selectionChanged') selection = known;
                if(mode === 'selectionCleared') selection = null;
                return {saved:mode !== 'cancel'};
            };
            functions(menuSource, sandbox, ['GetCurrentHumanFigure','IsNodeHumanFigure','GetAnotherHumanFigureParentedToTheCurrent']);
            vm.runInContext('function entry(){' + entryPrefix(menuSource) + '\nreturn oHumanFigure;}', sandbox);
            const resolved = sandbox.entry();
            assert.strictEqual(editors, 1);
            assert.strictEqual(checks, mode === 'cancel' ? 1 : 2);
            assert.strictEqual(reloads, mode === 'cancel' ? 0 : 1);
            assert.strictEqual(selectionReads, mode === 'cancel' ? 1 : 2);
            assert.strictEqual(busy, mode === 'selectionChanged' ? 1 : 0);
            assert.strictEqual(errors, ['stillUnsupported','selectionCleared'].includes(mode) ? 1 : 0);
            if(mode === 'selectionChanged') assert.strictEqual(resolved, known);
            assert.strictEqual(JSON.stringify(sandbox.oWM2Config), originalConfig, 'Setup does not auto-register the initial selection');
        });
    }
}
for (const mode of ['noSelection','alreadyBusy','supportedOwner']) test('Menu entry: ' + mode, () => {
    const w = world(), known = w.node('Genesis9', 'DzFigure');
    let editors = 0, busy = 0, errors = 0, selectionReads = 0;
    const sandbox = {
        PATH_ICONS:'/mock', Scene:{getNodeList:() => w.nodes, getPrimarySelection:() => { selectionReads++; return mode === 'noSelection' ? null : known; }},
        CheckForAnotherProcessActive:() => mode !== 'alreadyBusy', SetStatusBusy:() => busy++, err:() => errors++,
        FindBoundFigure:() => false, WM2ShowSupportedFigures:() => { editors++; return {saved:false}; }
    };
    loadSupport(sandbox);
    functions(menuSource, sandbox, ['GetCurrentHumanFigure','IsNodeHumanFigure','GetAnotherHumanFigureParentedToTheCurrent']);
    vm.runInContext('function entry(){' + entryPrefix(menuSource) + '\nreturn oHumanFigure;}', sandbox);
    const resolved = sandbox.entry();
    assert.strictEqual(editors, 0); assert.strictEqual(busy, mode === 'supportedOwner' ? 1 : 0);
    assert.strictEqual(errors, mode === 'noSelection' ? 1 : 0);
    assert.strictEqual(selectionReads, mode === 'alreadyBusy' ? 0 : 1);
    if(mode === 'supportedOwner') assert.strictEqual(resolved, known);
});
test('Menu removes figure settings button while retaining icon settings and separate launcher', () => {
    assert(!/WM2SettingsButton\([^\n]*"Supported Figures\.\.\."/.test(menuSource));
    assert(/WM2SettingsButton\([^\n]*"Icon Rules\.\.\."/.test(menuSource));
    assert(/connect\(wmIconRulesButton, "clicked\(\)"/.test(menuSource));
    assert(!/wmFiguresButton/.test(menuSource));
    const launcher = fs.readFileSync(path.join(sourceRoot, 'Wearables Manager Supported Figures.dsa'), 'utf8');
    assert(/WM2ShowSupportedFigures\(/.test(launcher));
    const full = fs.readFileSync(path.join(sourceRoot, 'Wearables Manager Full.dsa'), 'utf8');
    assert(/WM2SettingsButton\([^\n]*"Supported Figures\.\.\."/.test(full));
});
const failures = results.filter(result => !result.pass);
console.log(JSON.stringify({scope:'Actual source-extracted entry, protection and zero-removal tests; mocked native services; no DAZ or writes', total:results.length, passed:results.length-failures.length, failed:failures.length, failures}));
process.exitCode = failures.length ? 1 : 0;
