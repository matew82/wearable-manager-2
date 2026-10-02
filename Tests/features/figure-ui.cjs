'use strict';
// Focused actual-source figure UI/settings tests. No native DAZ, scene mutations,
// preference filesystem writes, or receipt files. Run directly or with --source-root.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--source-root')) {
    throw new Error('Usage: node Tests/features/figure-ui.cjs [--source-root <product-root>]');
}
const root = path.resolve(args.length ? args[1] : path.join(__dirname, '../..'));
const featureDirectory = path.join(root, 'Tests/features');
const sourcePaths = {
    support: path.join(root, 'Resources/WM2 Support.dsa'),
    ui: path.join(root, 'Resources/WM2 Settings UI.dsa')
};
// Freeze one pair of actual source texts for the entire run.
const snapshots = new Map(Object.values(sourcePaths).map(file => [path.resolve(file), fs.readFileSync(file, 'utf8')]));
const readOnlyFS = {
    readFileSync(file, encoding) {
        const text = snapshots.get(path.resolve(file));
        return text === undefined ? fs.readFileSync(file, encoding) : encoding ? text : Buffer.from(text);
    }
};
function controlledRequire(name) {
    if (name === 'fs' || name === 'node:fs') return readOnlyFS;
    if (!['path', 'node:path', 'vm', 'node:vm', 'assert', 'node:assert', 'crypto', 'node:crypto'].includes(name)) {
        throw new Error('Unexpected dependency in reused test prefix: ' + name);
    }
    return require(name);
}
function prefixExports(file, marker, exportsText, argv) {
    const filename = path.join(featureDirectory, file);
    const text = fs.readFileSync(filename, 'utf8');
    const stop = text.indexOf(marker);
    assert(stop > 0, 'Expected bounded helper prefix in ' + file);
    const context = vm.createContext({
        require: controlledRequire, __dirname: featureDirectory, __filename: filename,
        Buffer, console, module: {exports: {}}, process: {argv: argv || []}
    });
    // Only definitions before the first suite execute. The appended export is ours;
    // neither original runner nor its receipt-writing footer is evaluated.
    vm.runInContext(text.slice(0, stop) + '\nmodule.exports = ' + exportsText + ';', context, {filename});
    return context.module.exports;
}
const ui = prefixExports('ui.cjs', "test('ES5", '{environment, plain}', []);
const io = prefixExports('config.cjs', '\nconst tests=[];', '{fixture, RESOURCE, TARGET, LEGACY}',
    ['node', 'figure-ui', sourcePaths.support]);
const plain = value => JSON.parse(JSON.stringify(value));
const defaults = plain(io.fixture().support.defaults());
const tests = [];
function test(name, run) {
    try { run(); tests.push({name, pass: true}); }
    catch (error) { tests.push({name, pass: false, message: String(error), stack: error.stack}); }
}
function config() {
    const value = plain(defaults);
    value.iconRules = [{kind: 'nameWord', pattern: 'Shirt', icon: 'A.png'}];
    value.supportedFigures = ['Custom'];
    value.protectedChildren = [{figure: 'Custom', children: ['Existing']}];
    return value;
}
function last(environment, kind) {
    const matches = environment.g.widgets.filter(widget => widget.kind === kind);
    assert(matches.length, 'Missing widget ' + kind);
    return matches[matches.length - 1];
}
function click(environment, text) {
    const matches = environment.g.widgets.filter(widget => widget.kind === 'DzPushButton' && widget.text === text);
    assert(matches.length, 'Missing button ' + text);
    const button = matches[matches.length - 1];
    assert(button.enabled, 'Button is disabled: ' + text);
    button.signals['clicked()'][0]();
}
function active(widget) {
    for (let current = widget; current; current = current.parent) if (current.deleted) return false;
    return true;
}
function editor(environment) {
    const matches = environment.g.widgets.filter(widget => widget.kind === 'DzScrollArea' && widget.wm2EditorRows && active(widget));
    assert(matches.length, 'Missing active styled editor rows');
    return matches[matches.length - 1].wm2EditorRows;
}
function editorNames(environment) { return plain(editor(environment).entries).map(entry => entry.name); }
function clickEditorRow(environment, index) {
    const list = editor(environment), row = list.rows[index];
    assert(row && row.button, 'Missing editor row ' + index);
    assert.equal(row.button.wm2RowIndex, index); assert.equal(row.button.wm2RowName, list.entries[index].name);
    assert(row.button.enabled, 'Editor row button is disabled');
    const callbacks = row.button.signals['clicked()'] || [];
    assert.equal(callbacks.length, 1, 'Row has one selection callback'); callbacks[0]();
    assert.equal(list.currentItem, index, 'Actual row click selects its entry');
    assert.equal(environment.g.focusedWidget, row.button, 'Actual row click focuses its button');
    assert.equal(list.scroll.visibilityRequests[list.scroll.visibilityRequests.length - 1], row.widget, 'Actual row click reveals the selected row');
    return row;
}
function childDialog(environment, value, figureName = 'Custom') {
    return environment.context.WM2ShowProtectedChildren('C:/scratch/Resources', value, figureName);
}
function noSceneWrites(environment) { assert.equal(environment.g.sceneWrites, 0); }
function noFileMutation(fixture) {
    assert.equal(fixture.events.filter(event => ['write', 'rename', 'remove'].includes(event.operation)).length, 0);
}
function graphFixture(aliases = false) {
    const nodes = [], overrides = new Map(), writes = [];
    const native = node => node && node.nativeNode || node;
    function alias(node) {
        if (!node || !aliases) return node;
        return new Proxy({nativeNode: node}, {get(target, key) {
            if (key === 'nativeNode') return node;
            const value = node[key];
            return typeof value === 'function' ? (...args) => value.apply(node, args) : value;
        }, set() { writes.push('alias write'); throw Error('Scene node mutation'); }});
    }
    const indexed = values => Object.assign({length: values.length}, Object.fromEntries(values.map((node, i) => [i, alias(node)])));
    function add(internalName, type = 'DzNode', parent = null) {
        const node = {
            internalName, name: 'Fallback_' + nodes.length, elementID: String(100 + nodes.length),
            parent: native(parent), follow: null, label: 'Visible ' + internalName,
            getName() { return this.internalName; }, getLabel() { return this.label; }, className() { return type; },
            inherits(kind) { return kind === 'DzNode' || kind === type || kind === 'DzSkeleton' && ['DzFigure', 'DzLegacyFigure'].includes(type); },
            getFollowTarget() { return alias(this.follow); }, getNodeParent() { return alias(this.parent); },
            getNodeChildren(recursive) {
                const result = [], seen = new Set();
                function visit(owner) {
                    const children = overrides.has(owner) ? overrides.get(owner) : nodes.filter(child => child.parent === owner);
                    for (const child of children) { result.push(child); if (recursive && !seen.has(child)) { seen.add(child); visit(child); } }
                }
                visit(this); return indexed(result);
            },
            getSkeleton() { let node = this.parent; const seen = new Set(); while (node && !node.inherits('DzSkeleton')) { if (seen.has(node)) return null; seen.add(node); node = node.parent; } return alias(node); },
            getNumGraftFigures() { return 0; }, getGraftFigure() { return null; }, findDataItem() { return null; }
        };
        for (const method of ['addNodeChild', 'removeNodeChild', 'setFollowTarget', 'addDataItem', 'removeDataItem', 'setSelected']) node[method] = () => { writes.push(method); throw Error('Scene node mutation'); };
        nodes.push(node); return node;
    }
    const figure = (name = 'Custom', parent = null) => add(name, 'DzFigure', parent);
    function environment(value = config(), selected = []) {
        // ui.environment registers selected objects by JS identity during setup.
        // Reuse the initial live wrappers there; parent/child getters still return
        // fresh QObject aliases when enabled. Scene must contain each ID once.
        const registered = nodes.map(alias), selectedNodes = selected.map(node => registered[nodes.indexOf(native(node))]);
        return ui.environment({config: value, nodes: registered, selectedNodes, selected: selectedNodes[0] || null, hostList: true});
    }
    return {nodes, overrides, writes, add, figure, alias, environment};
}
function bulk(environment, value = config(), figureName = 'Custom') {
    return environment.support.addSelectedProtectedChildren(value, figureName, environment.context.Scene);
}
function rejectDraft(environment, value, fragment) {
    const before = plain(value), result = bulk(environment, value);
    assert.equal(result.ok, false, result.message);
    if (fragment) assert(result.message.includes(fragment), result.message);
    assert.deepEqual(value, before, 'Failure must retain the entire caller draft');
    if (result.config) assert.deepEqual(plain(result.config), before, 'No partial additions may be returned');
    noSceneWrites(environment);
}
function horseConfig(children, registered = true) {
    const value = config(); value.supportedFigures = registered ? ['DAZHorse2'] : [];
    value.protectedChildren = children === null ? [] : [{figure: 'DAZHorse2', children: children.slice()}];
    return value;
}
function horseFixture(tailType = 'DzFigure', fitted = false, aliases = true) {
    const graph = graphFixture(aliases), figure = graph.figure('DAZHorse2'), hip = graph.add('hip', 'DzBone', figure);
    const tail = graph.add('DAZHorse2Tail', tailType, hip); tail.label = 'Tail';
    if (fitted) tail.follow = figure;
    const tailBone = tailType === 'DzFigure' ? graph.add('tailBone', 'DzBone', tail) : null;
    const ribbon = graph.add('TailRibbon', 'DzNode', tailBone || tail), accessory = graph.add('HorseAccessory', 'DzNode', hip);
    return {graph, figure, hip, tail, tailBone, ribbon, accessory, names: ['DAZHorse2Tail', 'TailRibbon', 'HorseAccessory']};
}

test('reused prefixes define helpers without constructing dialogs or accessing IO', () => {
    const environment = ui.environment();
    assert.equal(environment.g.widgets.length, 0); assert.equal(environment.g.ioCalls, 0);
    assert.equal(environment.g.sceneReads, 0); noSceneWrites(environment);
});
test('child editor has only selection/removal actions, no manual or pending input', () => {
    const environment = ui.environment({config: config()});
    environment.g.steps = [() => {
        assert.equal(environment.g.widgets.filter(widget => widget.kind === 'DzLineEdit').length, 0);
        const buttons = environment.g.widgets.filter(widget => widget.kind === 'DzPushButton').map(widget => widget.text);
        assert(buttons.includes('Add Selected Children')); assert(buttons.includes('Remove Protection'));
        for (const removed of ['Protect Name', 'Use Selected Child', 'Restore Genesis Protection']) assert(!buttons.includes(removed));
        return false;
    }];
    assert.equal(childDialog(environment, config()).saved, false); noSceneWrites(environment);
});
test('bulk UI uses actual internal names and Save returns a clone without disk writes', () => {
    const graph = graphFixture(true), figure = graph.figure(), hat = graph.add('Hat', 'DzNode', figure), value = config(), before = plain(value), environment = graph.environment(value, [hat]);
    environment.g.steps = [() => { click(environment, 'Add Selected Children'); return true; }];
    const result = childDialog(environment, value);
    assert(result.saved); assert.deepEqual(plain(result.config.protectedChildren), [{figure: 'Custom', children: ['Existing', 'Hat']}]);
    assert.deepEqual(value, before); assert.equal(environment.g.saved.length, 0); noSceneWrites(environment); assert.deepEqual(graph.writes, []);
});
test('current Scene selection is reread on each click after dialog construction', () => {
    const graph = graphFixture(), figure = graph.figure(), a = graph.add('A', 'DzNode', figure), b = graph.add('B', 'DzNode', figure), environment = graph.environment(config(), [a]);
    environment.g.steps = [() => {
        environment.g.setSelection([b]); click(environment, 'Add Selected Children');
        assert.deepEqual(editorNames(environment), ['Existing', 'B']);
        environment.g.setSelection([a]); click(environment, 'Add Selected Children'); return true;
    }];
    assert.deepEqual(plain(childDialog(environment, config()).config.protectedChildren[0].children), ['Existing', 'B', 'A']); noSceneWrites(environment);
});
test('removal is preserved when a different selected child is subsequently added', () => {
    const graph = graphFixture(), figure = graph.figure(), hat = graph.add('Hat', 'DzNode', figure), environment = graph.environment(config(), [hat]);
    environment.g.steps = [() => {
        clickEditorRow(environment, 0); click(environment, 'Remove Protection');
        click(environment, 'Add Selected Children'); return true;
    }];
    assert.deepEqual(plain(childDialog(environment, config()).config.protectedChildren[0].children), ['Hat']); noSceneWrites(environment);
});
test('Add then Remove then Save does not re-add currently selected protection', () => {
    const graph = graphFixture(), figure = graph.figure(), hat = graph.add('Hat', 'DzNode', figure), value = config(), environment = graph.environment(value, [hat]);
    environment.g.steps = [() => {
        click(environment, 'Add Selected Children');
        clickEditorRow(environment, editorNames(environment).indexOf('Hat')); click(environment, 'Remove Protection'); return true;
    }];
    assert.deepEqual(plain(childDialog(environment, value).config), value); noSceneWrites(environment);
});
test('invalid selection shows a reason and Save cannot apply a partial draft', () => {
    const graph = graphFixture(), figure = graph.figure(), hat = graph.add('Hat', 'DzNode', figure), stale = graph.add('Gone', 'DzNode', figure), environment = graph.environment(config(), [hat, stale]);
    environment.g.nodes = environment.g.nodes.filter(node => node !== stale);
    environment.g.steps = [() => {
        click(environment, 'Add Selected Children'); assert.deepEqual(editorNames(environment), ['Existing']);
        assert(environment.g.widgets.some(widget => widget.kind === 'DzLabel' && widget.text.includes('unavailable'))); return true;
    }];
    assert.deepEqual(plain(childDialog(environment, config()).config), config()); noSceneWrites(environment);
});
for (const action of ['add', 'remove']) test('child Cancel discards ' + action + ' without saving', () => {
    const graph = graphFixture(), figure = graph.figure(), hat = graph.add('Hat', 'DzNode', figure), value = config(), before = plain(value), environment = graph.environment(value, [hat]);
    environment.g.steps = [() => {
        if (action === 'add') click(environment, 'Add Selected Children');
        else { clickEditorRow(environment, 0); click(environment, 'Remove Protection'); }
        return false;
    }];
    assert.equal(childDialog(environment, value).saved, false); assert.deepEqual(value, before); assert.equal(environment.g.saved.length, 0); noSceneWrites(environment);
});
for (const saveParent of [false, true]) test('parent ' + (saveParent ? 'Save commits' : 'Cancel discards') + ' accepted child draft', () => {
    const graph = graphFixture(), figure = graph.figure(), hat = graph.add('Hat', 'DzNode', figure), value = config(), before = plain(value), environment = graph.environment(value, [hat]);
    environment.g.steps = [
        () => { clickEditorRow(environment, 0); click(environment, 'Protected Children...'); return saveParent; },
        () => { click(environment, 'Add Selected Children'); return true; }
    ];
    assert.equal(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved, saveParent);
    assert.deepEqual(value, before); assert.equal(environment.g.saved.length, saveParent ? 1 : 0);
    if (saveParent) {
        assert.deepEqual(plain(environment.g.saved[0].config.protectedChildren), [{figure: 'Custom', children: ['Existing', 'Hat']}]);
        assert.deepEqual(plain(environment.g.saved[0].config.iconRules), value.iconRules);
        assert.equal(environment.g.saved[0].expectedRawToken, 'baseline-token');
    }
    noSceneWrites(environment);
});
test('failed parent Save retains protected draft before Cancel', () => {
    const graph = graphFixture(), figure = graph.figure(), hat = graph.add('Hat', 'DzNode', figure), value = config(), environment = ui.environment({config: value, nodes: graph.nodes, selected: hat, saveFailure: true});
    environment.g.steps = [
        () => { clickEditorRow(environment, 0); click(environment, 'Protected Children...'); return true; },
        () => { click(environment, 'Add Selected Children'); return true; },
        () => {
            assert(editor(environment).entries[0].detail.includes('protected children: 2'));
            assert(environment.g.widgets.some(widget => widget.kind === 'DzLabel' && widget.text === 'Forced save failure')); return false;
        }
    ];
    assert.equal(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved, false);
    assert.equal(environment.g.saved.length, 1);
    assert.deepEqual(plain(environment.g.saved[0].config.protectedChildren), [{figure: 'Custom', children: ['Existing', 'Hat']}]); noSceneWrites(environment);
});
for (const status of ['future-schema', 'unreadable', 'path-error']) test(status + ' disables all figure edits and Save', () => {
    const environment = ui.environment({config: config(), status, readOnly: true});
    environment.g.steps = [(_, dialog) => {
        clickEditorRow(environment, 0);
        for (const text of ['Protected Children...', 'Remove', 'Add Selected Figure', 'Reset Genesis Defaults']) assert.equal(environment.button(text).enabled, false);
        assert.equal(dialog.acceptButton.enabled, false); return false;
    }];
    assert.equal(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved, false);
    assert.equal(environment.g.saved.length, 0); assert.equal(environment.g.sceneReads, 0); noSceneWrites(environment);
});
for (const useBone of [false, true]) test('actual getName identity displayed and saved from ' + (useBone ? 'selected bone owner' : 'selected figure'), () => {
    const graph = graphFixture(true), figure = graph.figure('ActualInternal'), bone = graph.add('jaw', 'DzBone', figure);
    figure.label = 'Different visible label';
    const value = config(); value.supportedFigures = []; value.protectedChildren = [];
    const environment = graph.environment(value, [useBone ? bone : figure]);
    environment.g.steps = [() => {
        click(environment, 'Add Selected Figure'); assert.equal(editor(environment).entries[0].text, 'ActualInternal');
        assert(environment.status().text.includes('Internal name: ActualInternal | Visible label: Different visible label')); return true;
    }];
    assert(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved);
    assert.deepEqual(plain(environment.g.saved[0].config.supportedFigures), ['ActualInternal']); noSceneWrites(environment);
});
for (const aliases of [false, true]) test('bulk bone-attached/nested selection and same-type copies dedup exact names (' + aliases + ')', () => {
    const graph = graphFixture(aliases), figure = graph.figure(), bone = graph.add('hip', 'DzBone', figure), hat = graph.add('Hat', 'DzNode', bone), cloth = graph.figure('Clothing', figure), button = graph.add('Button', 'DzNode', cloth), copy = graph.figure(), another = graph.add('Hat', 'DzNode', copy), lower = graph.add('hat', 'DzNode', copy), existing = graph.add('Existing', 'DzNode', figure);
    const value = config(), before = plain(value), environment = graph.environment(value, [hat, button, another, lower, existing]), result = bulk(environment, value);
    assert(result.ok, result.message); assert.deepEqual(plain(result.children), ['Existing', 'Hat', 'Button', 'hat']);
    assert.equal(result.added, 3); assert.equal(result.alreadyProtected, 2); assert.deepEqual(plain(result.skipped), []);
    assert.deepEqual(value, before); noSceneWrites(environment); assert.deepEqual(graph.writes, []);
});
test('own figure/bone expands once while foreign profiles and unattached props are explained', () => {
    const graph = graphFixture(), figure = graph.figure(), bone = graph.add('hip', 'DzBone', figure), foreign = graph.figure('Other'), foreignChild = graph.add('OtherHat', 'DzNode', foreign), prop = graph.add('Loose'), valid = graph.add('Hat', 'DzNode', figure), environment = graph.environment(config(), [figure, bone, foreignChild, prop, valid]), result = bulk(environment);
    assert(result.ok, result.message); assert.equal(result.added, 1); assert.equal(result.filledOwners, 1); assert.equal(result.skipped.length, 2);
    for (const skip of result.skipped) { assert(skip.label.startsWith('Visible ')); assert(skip.reason.length); }
    assert(result.message.includes('Skipped 2')); noSceneWrites(environment);
});
test('all ineligible live selections are explained without altering protection', () => {
    const graph = graphFixture(), figure = graph.figure('Foreign'), bone = graph.add('hip', 'DzBone', figure), environment = graph.environment(config(), [figure, bone]), result = bulk(environment);
    assert(result.ok); assert.equal(result.added, 0); assert.deepEqual(plain(result.config), config()); assert.equal(result.skipped.length, 2); noSceneWrites(environment);
});
test('empty selection rejects with clear guidance', () => {
    const graph = graphFixture(); graph.figure(); rejectDraft(graph.environment(), config(), 'Select attached children');
});
test('unregistered profile rejects selection before adding names', () => {
    const graph = graphFixture(), figure = graph.figure(), child = graph.add('Hat', 'DzNode', figure), environment = graph.environment(config(), [child]);
    assert.equal(bulk(environment, config(), 'NotRegistered').ok, false); noSceneWrites(environment);
});
for (const fault of ['stale', 'ambiguous ID', 'missing membership', 'duplicate membership', 'stale parent', 'broken intermediate edge', 'cycle']) test('bulk ' + fault + ' rejects whole draft after an earlier valid child', () => {
    const graph = graphFixture(), figure = graph.figure(), good = graph.add('First', 'DzNode', figure), parent = graph.add('Container', 'DzNode', figure), bad = graph.add('Bad', 'DzNode', parent), environment = graph.environment(config(), [good, bad]);
    if (fault === 'stale') environment.g.nodes = environment.g.nodes.filter(node => node !== bad);
    if (fault === 'ambiguous ID') { const duplicate = graph.add('Duplicate'); duplicate.elementID = bad.elementID; environment.g.nodes.push(duplicate); }
    if (fault === 'missing membership') graph.overrides.set(parent, []);
    if (fault === 'duplicate membership') graph.overrides.set(parent, [bad, bad]);
    if (fault === 'stale parent') environment.g.nodes = environment.g.nodes.filter(node => node !== parent);
    if (fault === 'broken intermediate edge') graph.overrides.set(figure, [good]);
    if (fault === 'cycle') { parent.parent = bad; graph.overrides.set(parent, [bad]); graph.overrides.set(bad, [parent]); }
    rejectDraft(environment, config());
});
test('profile limit rejects all additions rather than returning a partial draft', () => {
    const graph = graphFixture(), figure = graph.figure(), a = graph.add('NewA', 'DzNode', figure), b = graph.add('NewB', 'DzNode', figure), value = config();
    value.protectedChildren[0].children = Array.from({length: 255}, (_, index) => 'Existing' + index);
    rejectDraft(graph.environment(value, [a, b]), value);
});
test('2,001 selected nodes reject before processing a bounded partial selection', () => {
    const graph = graphFixture(), figure = graph.figure(), child = graph.add('Hat', 'DzNode', figure), environment = graph.environment(config(), [child]);
    environment.g.selectedNodes = Array.from({length: 2001}, () => child); rejectDraft(environment, config(), '2,000');
});
for (const name of ['Custom', 'Genesis9']) test('new ' + name + ' registration seeds all nonbone descendants through bones/nested figures', () => {
    const graph = graphFixture(true), figure = graph.figure(name), bone = graph.add('hip', 'DzBone', figure);
    graph.add('Hat', 'DzNode', bone); const nested = graph.figure('Clothing', figure), nestedBone = graph.add('clothBone', 'DzBone', nested);
    graph.add('Button', 'DzNode', nestedBone); graph.add('Hat', 'DzNode', nested);
    const value = config(); value.supportedFigures = []; value.protectedChildren = [];
    const environment = graph.environment(value, [figure]), before = plain(value), result = environment.support.addSupportedFigure(value, graph.alias(figure));
    assert(result.ok, result.message); assert.deepEqual(plain(result.config.supportedFigures), [name]);
    assert.deepEqual(plain(result.config.protectedChildren), [{figure: name, children: ['Hat', 'Clothing', 'Button']}]);
    assert.deepEqual(value, before); noSceneWrites(environment); assert.deepEqual(graph.writes, []);
});
for (const name of ['Custom', 'Genesis9']) for (const children of [[], ['Customized']]) test(name + ' registration preserves existing ' + (children.length ? 'customized' : 'empty') + ' profile', () => {
    const graph = graphFixture(), figure = graph.figure(name); graph.add('NewAttached', 'DzNode', figure);
    const value = config(); value.supportedFigures = [name]; value.protectedChildren = [{figure: name, children}];
    const environment = graph.environment(value, [figure]), result = environment.support.addSupportedFigure(value, figure);
    assert(result.ok, result.message); assert.deepEqual(plain(result.config.protectedChildren), value.protectedChildren); noSceneWrites(environment);
});

for (const name of ['Custom', 'Genesis9']) for (const children of [[], ['Customized']]) test('NEW ' + name + ' registration merges descendants into an existing ' + (children.length ? 'partial' : 'empty') + ' profile', () => {
    const graph = graphFixture(true), figure = graph.figure(name); graph.add('NewAttached', 'DzNode', figure);
    const value = config(); value.supportedFigures = []; value.protectedChildren = [{figure: name, children}];
    const before = plain(value), environment = graph.environment(value, [figure]), result = environment.support.addSupportedFigure(value, graph.alias(figure));
    assert(result.ok, result.message); assert.deepEqual(plain(result.config.protectedChildren), [{figure: name, children: children.concat('NewAttached')}]);
    assert.deepEqual(value, before); noSceneWrites(environment); assert.deepEqual(graph.writes, []);
});
for (const [tailType, fitted] of [['DzNode', false], ['DzFigure', false], ['DzFigure', true]]) for (const profile of ['missing', 'empty', 'partial']) test('NEW Horse registration protects visible Tail/internal DAZHorse2Tail: ' + tailType + '/' + fitted + '/' + profile, () => {
    const horse = horseFixture(tailType, fitted), children = profile === 'missing' ? null : profile === 'empty' ? [] : ['SavedOnly', 'DAZHorse2Tail'];
    const value = horseConfig(children, false), before = plain(value), environment = horse.graph.environment(value, [horse.figure]);
    const result = environment.support.addSupportedFigure(value, horse.graph.alias(horse.figure));
    assert(result.ok, result.message); const names = plain(result.config.protectedChildren[0].children);
    assert.deepEqual(names.slice(0, (children || []).length), children || []);
    assert.deepEqual(names.slice().sort(), Array.from(new Set((children || []).concat(horse.names))).sort());
    assert(!names.includes('Tail')); assert(!names.includes('hip')); assert(!names.includes('tailBone'));
    assert.deepEqual(value, before); noSceneWrites(environment); assert.deepEqual(horse.graph.writes, []);
});
test('registered Horse missing-profile bootstrap protects all current nonbone descendants', () => {
    const horse = horseFixture(), value = horseConfig(null), environment = horse.graph.environment(value, [horse.figure]);
    const result = environment.support.addSupportedFigure(value, horse.graph.alias(horse.figure));
    assert(result.ok, result.message); assert.deepEqual(plain(result.config.protectedChildren[0].children).sort(), horse.names.slice().sort()); noSceneWrites(environment);
});
for (const children of [[], ['DAZHorse2Tail']]) test('already registered Horse preserves intentional ' + (children.length ? 'partial' : 'empty') + ' protection on re-add', () => {
    const horse = horseFixture(), value = horseConfig(children), before = plain(value), environment = horse.graph.environment(value, [horse.figure]);
    const result = environment.support.addSupportedFigure(value, horse.graph.alias(horse.figure));
    assert(result.ok, result.message); assert.deepEqual(plain(result.config), before); noSceneWrites(environment);
});
for (const selectedBone of [false, true]) test('Horse ' + (selectedBone ? 'own bone' : 'figure') + ' fills partial protection with all attached names', () => {
    const horse = horseFixture('DzFigure', true), value = horseConfig(['SavedOnly', 'DAZHorse2Tail']), environment = horse.graph.environment(value, [selectedBone ? horse.hip : horse.figure]);
    const before = plain(value), result = bulk(environment, value, 'DAZHorse2');
    assert(result.ok, result.message); assert.equal(result.filledOwners, 1); assert.equal(result.added, 2);
    assert.deepEqual(plain(result.children).sort(), ['SavedOnly'].concat(horse.names).sort()); assert.deepEqual(plain(result.skipped), []);
    assert.deepEqual(value, before); noSceneWrites(environment); assert.deepEqual(horse.graph.writes, []);
});
test('duplicate Horse figure/own-bone selections expand one live owner exactly once', () => {
    const horse = horseFixture(), value = horseConfig([]), environment = horse.graph.environment(value, [horse.figure, horse.hip, horse.figure, horse.hip]);
    const result = bulk(environment, value, 'DAZHorse2'); assert(result.ok, result.message);
    assert.equal(result.filledOwners, 1); assert.equal(result.added, horse.names.length); assert.equal(result.alreadyProtected, 0);
    assert.deepEqual(plain(result.children).sort(), horse.names.slice().sort()); noSceneWrites(environment);
});
test('same-type Horse owner copies share one profile but each owner fills once', () => {
    const horse = horseFixture(), second = horse.graph.figure('DAZHorse2'), bone = horse.graph.add('copyHip', 'DzBone', second);
    horse.graph.add('HorseMane', 'DzNode', bone);
    const value = horseConfig([]), environment = horse.graph.environment(value, [horse.figure, second, bone]), result = bulk(environment, value, 'DAZHorse2');
    assert(result.ok, result.message); assert.equal(result.filledOwners, 2); assert.equal(result.added, 4);
    assert.deepEqual(plain(result.children).sort(), horse.names.concat('HorseMane').sort()); noSceneWrites(environment);
});
test('foreign figure/bone are explained while mixed Horse child selection stays individual', () => {
    const horse = horseFixture(), foreign = horse.graph.figure('Dragon'), foreignBone = horse.graph.add('dragonHip', 'DzBone', foreign);
    horse.graph.add('ForeignTail', 'DzNode', foreignBone);
    const value = horseConfig([]), environment = horse.graph.environment(value, [foreign, foreignBone, horse.tail]), result = bulk(environment, value, 'DAZHorse2');
    assert(result.ok, result.message); assert.equal(result.filledOwners, 0); assert.equal(result.added, 1);
    assert.deepEqual(plain(result.children), ['DAZHorse2Tail']); assert.equal(result.skipped.length, 2);
    for (const item of result.skipped) { assert(item.label); assert(item.reason.includes('DAZHorse2')); }
    noSceneWrites(environment);
});
test('individual nested Tail selection does not implicitly protect its siblings or descendants', () => {
    const horse = horseFixture('DzFigure', true), value = horseConfig([]), environment = horse.graph.environment(value, [horse.ribbon]);
    const result = bulk(environment, value, 'DAZHorse2'); assert(result.ok, result.message);
    assert.equal(result.filledOwners, 0); assert.deepEqual(plain(result.children), ['TailRibbon']); noSceneWrites(environment);
});
for (const selectedBone of [false, true]) test('Horse child editor expands ' + (selectedBone ? 'bone' : 'figure') + ' only on explicit bulk Add after removal', () => {
    const horse = horseFixture(), value = horseConfig(['DAZHorse2Tail']), environment = horse.graph.environment(value, [selectedBone ? horse.hip : horse.figure]);
    environment.g.steps = [() => {
        clickEditorRow(environment, 0); click(environment, 'Remove Protection');
        assert.deepEqual(editorNames(environment), []);
        assert.equal(environment.g.focusedWidget, environment.button('Add Selected Children'));
        click(environment, 'Add Selected Children'); assert.deepEqual(editorNames(environment).sort(), horse.names.slice().sort()); return true;
    }];
    const result = childDialog(environment, value, 'DAZHorse2'); assert(result.saved);
    assert.deepEqual(plain(result.config.protectedChildren[0].children).sort(), horse.names.slice().sort()); assert.equal(environment.g.saved.length, 0); noSceneWrites(environment);
});
test('selected Horse figure does not refill a removal on Save without explicit Add', () => {
    const horse = horseFixture(), value = horseConfig(['DAZHorse2Tail']), environment = horse.graph.environment(value, [horse.figure]);
    environment.g.steps = [() => { clickEditorRow(environment, 0); click(environment, 'Remove Protection'); return true; }];
    assert.deepEqual(plain(childDialog(environment, value, 'DAZHorse2').config.protectedChildren[0].children), []); noSceneWrites(environment);
});
for (const fault of ['missing membership', 'duplicate membership', 'stale child', 'changed child parent']) test('Horse owner expansion ' + fault + ' rejects the entire mixed batch', () => {
    const horse = horseFixture('DzFigure', true, false), value = horseConfig([]), environment = horse.graph.environment(value, [horse.accessory, horse.figure]);
    if (fault === 'missing membership') horse.graph.overrides.set(horse.hip, [horse.accessory]);
    if (fault === 'duplicate membership') horse.graph.overrides.set(horse.hip, [horse.tail, horse.tail, horse.accessory]);
    if (fault === 'stale child') environment.g.nodes = environment.g.nodes.filter(node => node !== horse.tail);
    if (fault === 'changed child parent') { horse.graph.overrides.set(horse.hip, [horse.tail, horse.accessory]); horse.tail.parent = null; }
    const before = plain(value), result = bulk(environment, value, 'DAZHorse2');
    assert.equal(result.ok, false, result.message); assert.deepEqual(value, before);
    if (result.config) assert.deepEqual(plain(result.config), before); noSceneWrites(environment);
});
for (const names of [[], ['Genesis9', 'Custom'], ['Genesis10', 'Genesis10Female', ' Wolf ']]) {
    test('schema1 migration preserves exact saved names ' + JSON.stringify(names), () => {
        const legacy = {schema: 1, iconRules: [{kind: 'labelPrefix', pattern: 'Hair', icon: 'A.PNG'}], supportedFigures: names};
        const raw = ' ' + JSON.stringify(legacy) + '\n', fixture = io.fixture(raw), loaded = fixture.support.load(io.RESOURCE);
        assert.equal(loaded.status, 'ok'); assert.equal(loaded.config.schema, 2);
        assert.deepEqual(plain(loaded.config.iconRules), legacy.iconRules);
        assert.deepEqual(plain(loaded.config.supportedFigures), names);
        assert.deepEqual(plain(loaded.config.protectedChildren), defaults.protectedChildren);
        assert.equal(fixture.files.get(io.TARGET).raw, raw); noFileMutation(fixture);
        assert(fixture.support.save(io.RESOURCE, loaded.config, loaded.rawToken).ok);
        assert.equal(JSON.parse(fixture.files.get(io.TARGET).raw).schema, 2);
        assert.equal(fixture.files.get(io.LEGACY).raw, fixture.legacy);
    });
}
for (const schema of [3, 99, 1.5]) test('future schema ' + schema + ' is preserved despite matching Save token', () => {
    const raw = JSON.stringify({schema, keep: {arbitrary: [1, 2]}}), fixture = io.fixture(raw), loaded = fixture.support.load(io.RESOURCE);
    assert(loaded.readOnly); assert.equal(loaded.status, 'future-schema');
    assert.equal(fixture.support.save(io.RESOURCE, defaults, loaded.rawToken).ok, false);
    assert.equal(fixture.files.get(io.TARGET).raw, raw); noFileMutation(fixture);
});
for (const field of ['supportedFigures', 'protectedChildren', 'children']) test('257-entry ' + field + ' exceeds the bound', () => {
    const value = config();
    if (field === 'children') value.protectedChildren[0].children = Array.from({length: 257}, (_, index) => 'Child' + index);
    else if (field === 'supportedFigures') value[field] = Array.from({length: 257}, (_, index) => 'Figure' + index);
    else value[field] = Array.from({length: 257}, (_, index) => ({figure: 'Figure' + index, children: []}));
    assert.equal(io.fixture().support.validate(value).ok, false);
});
test('unknown root fields are rejected rather than silently dropped', () => {
    const value = config(); value.unexpected = {preserve: true};
    assert.equal(io.fixture().support.validate(value).ok, false);
});

const hiddenFigureNames = ['Genesis9_1', 'Genesis9.1', 'Genesis10', 'Genesis10Female', 'Genesis10Male'];
function registry(names) {
    const value = config(); value.supportedFigures = names.slice();
    value.protectedChildren = names.map(name => ({figure: name, children: ['Protected_' + name]}));
    return value;
}
function rowStructure(environment, list) {
    for (let index = 0; index < list.rows.length; index++) {
        const row = list.rows[index], entry = list.entries[index];
        assert.equal(row.widget.kind, 'DzWidget'); assert.equal(row.button.kind, 'DzPushButton'); assert.equal(row.label.kind, 'DzLabel');
        assert.equal(row.button.wm2RowName, entry.name); assert.equal(row.button.wm2RowIndex, index);
        assert.equal(row.label.text, entry.text); assert.equal(row.label.textFormat, environment.context.DzLabel.PlainText);
        assert(row.label.font.bold); assert(row.label.font.pointSize >= 16);
        assert(environment.g.widgets.indexOf(row.button) < environment.g.widgets.indexOf(row.label), 'Left selection button is created before the large label');
        const rowWidgets = row.widget.wm2TestLayout.children.filter(item => item.widget).map(item => item.widget);
        assert.equal(rowWidgets[0], row.button, 'The row layout places the selection button first');
        assert.equal(rowWidgets[1], row.label.parent, 'The text column follows the left button');
        assert.equal(row.selected, index === list.currentItem);
        if (entry.detail) { assert.equal(row.detailLabel.text, entry.detail); assert.equal(row.detailLabel.textFormat, environment.context.DzLabel.PlainText); }
    }
}
test('figure and protected-child containers use the same large plain row structure', () => {
    const environment = ui.environment({config: config()}), signatures = [];
    environment.g.steps = [
        () => {
            const list = editor(environment); rowStructure(environment, list);
            assert.deepEqual(plain(list.entries), [{name: 'Custom', text: 'Custom', detail: 'Custom figure | protected children: 1'}]);
            assert.equal(environment.g.widgets.filter(widget => widget.kind === 'DzListBox').length, 0);
            signatures.push([list.rows[0].button.kind, list.rows[0].label.kind, list.rows[0].label.font.family, list.rows[0].label.font.pointSize, list.rows[0].label.font.bold]);
            clickEditorRow(environment, 0); click(environment, 'Protected Children...'); return false;
        },
        () => {
            const list = editor(environment); rowStructure(environment, list); assert.deepEqual(editorNames(environment), ['Existing']);
            signatures.push([list.rows[0].button.kind, list.rows[0].label.kind, list.rows[0].label.font.family, list.rows[0].label.font.pointSize, list.rows[0].label.font.bold]);
            assert.equal(environment.g.widgets.filter(widget => widget.kind === 'DzListBox').length, 0); return false;
        }
    ];
    assert.equal(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved, false);
    assert.deepEqual(signatures[0], signatures[1]); noSceneWrites(environment);
});
for (const child of [false, true]) test((child ? 'child' : 'figure') + ' row clicks highlight exactly one row and enable actions without Scene reads', () => {
    const value = registry(['First', 'Second']), environment = ui.environment({config: value});
    value.protectedChildren[0].children = ['A', 'B'];
    environment.g.steps = [() => {
        const list = editor(environment), action = child ? 'Remove Protection' : 'Remove';
        assert.equal(environment.button(action).enabled, false); assert.equal(list.currentItem, -1);
        const reads = environment.g.sceneReads, initialCSS = list.rows[0].widget.getWidget().styleSheet;
        clickEditorRow(environment, 0); assert(list.rows[0].selected); assert(!list.rows[1].selected);
        assert.equal(environment.button(action).enabled, true); assert.notEqual(list.rows[0].widget.getWidget().styleSheet, initialCSS);
        clickEditorRow(environment, 1); assert(!list.rows[0].selected); assert(list.rows[1].selected);
        assert.equal(environment.g.sceneReads, reads); assert.equal(environment.g.selected, null); rowStructure(environment, list); return false;
    }];
    if (child) assert.equal(childDialog(environment, value, 'First').saved, false);
    else assert.equal(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved, false);
    noSceneWrites(environment);
});
test('only the five exact placeholder names are hidden and explicit Save preserves their profiles', () => {
    const names = ['Genesis9', ...hiddenFigureNames, 'Genesis10Dragon', 'Genesis9_10', 'Genesis9.10', 'genesis10'], value = registry(names), before = plain(value), environment = ui.environment({config: value});
    environment.g.steps = [() => {
        assert.deepEqual(editorNames(environment), ['Genesis9', 'Genesis10Dragon', 'Genesis9_10', 'Genesis9.10', 'genesis10']);
        assert.equal(editor(environment).entries[0].detail, 'Genesis default | protected children: 1'); rowStructure(environment, editor(environment)); return true;
    }];
    assert(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved);
    assert.deepEqual(plain(environment.g.saved[0].config), before); assert.deepEqual(value, before); noSceneWrites(environment);
});
for (const names of [['Genesis10', 'First', 'Second'], ['First', 'Genesis10Female', 'Second', 'Genesis9_1']]) test('visible Remove resolves the entry name after hidden entries ' + JSON.stringify(names), () => {
    const value = registry(names), before = plain(value), environment = ui.environment({config: value});
    environment.g.steps = [() => {
        assert.deepEqual(editorNames(environment), ['First', 'Second']); clickEditorRow(environment, 1); click(environment, 'Remove');
        const list = editor(environment);
        assert.deepEqual(editorNames(environment), ['First']); assert.equal(list.entries[list.currentItem].name, 'First');
        assert.equal(environment.g.focusedWidget, list.rows[list.currentItem].button);
        assert.equal(list.scroll.visibilityRequests[list.scroll.visibilityRequests.length - 1], list.rows[list.currentItem].widget); return true;
    }];
    assert(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved);
    const saved = plain(environment.g.saved[0].config);
    assert.deepEqual(saved.supportedFigures, names.filter(name => name !== 'Second')); assert.deepEqual(saved.protectedChildren, before.protectedChildren);
    assert.deepEqual(value, before); noSceneWrites(environment);
});
for (const names of [['Genesis10', 'First', 'Second'], ['First', 'Genesis9.1', 'Second']]) test('Protected Children resolves the selected visible name after hidden entries ' + JSON.stringify(names), () => {
    const value = registry(names), environment = ui.environment({config: value});
    environment.g.steps = [
        () => { clickEditorRow(environment, 1); click(environment, 'Protected Children...'); const list = editor(environment); assert.equal(list.entries[list.currentItem].name, 'Second'); assert.equal(environment.g.focusedWidget, list.rows[list.currentItem].button); return true; },
        (_, dialog) => { assert.equal(dialog.caption, 'Protected Children: Second'); assert.deepEqual(editorNames(environment), ['Protected_Second']); clickEditorRow(environment, 0); click(environment, 'Remove Protection'); return true; }
    ];
    assert(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved);
    const saved = plain(environment.g.saved[0].config); assert.deepEqual(saved.supportedFigures, names);
    assert.deepEqual(saved.protectedChildren, names.map(name => ({figure: name, children: name === 'Second' ? [] : ['Protected_' + name]}))); noSceneWrites(environment);
});
test('Cancel discards visible removals and retains hidden entries and every profile', () => {
    const value = registry(['Genesis9_1', 'Custom', 'Genesis10Dragon', 'Genesis10Male']), before = plain(value), environment = ui.environment({config: value});
    environment.g.steps = [() => { clickEditorRow(environment, 0); click(environment, 'Remove'); assert.deepEqual(editorNames(environment), ['Genesis10Dragon']); return false; }];
    assert.equal(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved, false);
    assert.deepEqual(value, before); assert.equal(environment.g.saved.length, 0); noSceneWrites(environment);
});
test('all-hidden registry has an empty visible container and Save preserves the complete registry', () => {
    const value = registry(hiddenFigureNames), environment = ui.environment({config: value});
    environment.g.steps = [() => { assert.deepEqual(editorNames(environment), []); assert.equal(editor(environment).currentItem, -1); assert.equal(environment.button('Remove').enabled, false); assert.equal(environment.button('Protected Children...').enabled, false); return true; }];
    assert(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved); assert.deepEqual(plain(environment.g.saved[0].config), value); noSceneWrites(environment);
});
for (const child of [false, true]) test('stale ' + (child ? 'child' : 'figure') + ' row button cannot change selection after removal/repopulation', () => {
    const value = registry(['First', 'Second', 'Third']); value.protectedChildren[0].children = ['A', 'B', 'C'];
    const environment = ui.environment({config: value});
    environment.g.steps = [() => {
        const list = editor(environment), old = list.rows[0].button; clickEditorRow(environment, 0); click(environment, child ? 'Remove Protection' : 'Remove');
        assert.deepEqual(editorNames(environment), child ? ['B', 'C'] : ['Second', 'Third']);
        const current = list.currentItem, name = list.entries[current].name;
        assert.equal(environment.g.focusedWidget, list.rows[current].button);
        assert.equal(list.scroll.visibilityRequests[list.scroll.visibilityRequests.length - 1], list.rows[current].widget); old.signals['clicked()'][0]();
        assert.equal(list.currentItem, current); assert.equal(list.entries[list.currentItem].name, name); rowStructure(environment, list); return false;
    }];
    if (child) assert.equal(childDialog(environment, value, 'First').saved, false);
    else assert.equal(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved, false);
    noSceneWrites(environment);
});
test('empty registry Add selects the exact new row and Remove returns to empty without deleting its profile', () => {
    const graph = graphFixture(), figure = graph.figure('NewFigure'); graph.add('Tail', 'DzNode', figure);
    const value = registry([]), environment = graph.environment(value, [figure]);
    environment.g.steps = [() => {
        assert.deepEqual(editorNames(environment), []); click(environment, 'Add Selected Figure');
        assert.deepEqual(editorNames(environment), ['NewFigure']); assert.equal(editor(environment).currentItem, 0); assert(editor(environment).rows[0].selected);
        assert.equal(environment.g.focusedWidget, editor(environment).rows[0].button);
        assert.equal(environment.button('Remove').enabled, true); click(environment, 'Remove');
        assert.deepEqual(editorNames(environment), []); assert.equal(editor(environment).currentItem, -1); assert.equal(environment.button('Remove').enabled, false);
        assert.equal(environment.g.focusedWidget, environment.button('Add Selected Figure')); return true;
    }];
    assert(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved);
    assert.deepEqual(plain(environment.g.saved[0].config.supportedFigures), []); assert.deepEqual(plain(environment.g.saved[0].config.protectedChildren), [{figure: 'NewFigure', children: ['Tail']}]); noSceneWrites(environment);
});
for (const existingSelection of [false, true]) test('child Add ' + (existingSelection ? 'preserves the exact selected name' : 'selects the first newly added name'), () => {
    const graph = graphFixture(), figure = graph.figure(), hat = graph.add('Hat', 'DzNode', figure), environment = graph.environment(config(), [hat]);
    environment.g.steps = [() => {
        if (existingSelection) clickEditorRow(environment, 0);
        click(environment, 'Add Selected Children'); const list = editor(environment);
        assert.equal(list.entries[list.currentItem].name, existingSelection ? 'Existing' : 'Hat');
        assert.equal(environment.g.focusedWidget, list.rows[list.currentItem].button);
        assert.equal(list.scroll.visibilityRequests[list.scroll.visibilityRequests.length - 1], list.rows[list.currentItem].widget); rowStructure(environment, list); return true;
    }];
    assert(childDialog(environment, config()).saved); noSceneWrites(environment);
});
test('row labels preserve literal markup-like internal names as plain text', () => {
    const name = 'Figure<tag>&', child = 'Tail<tag>&', value = registry([name]), environment = ui.environment({config: value});
    value.protectedChildren[0].children = [child]; environment.g.steps = [
        () => { assert.equal(editor(environment).rows[0].label.text, name); rowStructure(environment, editor(environment)); clickEditorRow(environment, 0); click(environment, 'Protected Children...'); return false; },
        () => { assert.equal(editor(environment).rows[0].label.text, child); rowStructure(environment, editor(environment)); return false; }
    ];
    assert.equal(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved, false); noSceneWrites(environment);
});
for (const throwing of [false, true]) test('row arrow ' + (throwing ? 'throwing loader' : 'missing PNG') + ' retains the usable text selector', () => {
    const environment = ui.environment({config: config(), pixmapThrows: throwing});
    environment.g.steps = [() => {
        const row = editor(environment).rows[0]; assert.equal(row.button.text, '>');
        assert(!row.button.pixmap || row.button.pixmap.isNull()); clickEditorRow(environment, 0);
        assert.equal(environment.button('Protected Children...').enabled, true); return false;
    }];
    assert.equal(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved, false); noSceneWrites(environment);
});
for (const throwing of [false, true]) test((throwing ? 'throwing' : 'missing') + ' optional focus/scroll APIs cannot block row selection or Save', () => {
    const value = config(), environment = ui.environment({config: value});
    environment.g.steps = [() => {
        const list = editor(environment), button = list.rows[0].button;
        list.scroll.ensureWidgetVisible = throwing ? () => { throw Error('Optional scroll API unavailable'); } : undefined;
        button.native.setFocus = throwing ? () => { throw Error('Optional focus API unavailable'); } : undefined;
        button.signals['clicked()'][0](); assert.equal(list.currentItem, 0); assert(list.rows[0].selected);
        assert.equal(environment.button('Remove').enabled, true); return true;
    }];
    assert(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved);
    assert.deepEqual(plain(environment.g.saved[0].config), value); noSceneWrites(environment);
});

const failures = tests.filter(item => !item.pass).map(({name, message, stack}) => ({name, message, stack}));
console.log(JSON.stringify({passed: tests.length - failures.length, failed: failures.length, failures}));
process.exitCode = failures.length ? 1 : 0;
