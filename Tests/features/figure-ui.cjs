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
        assert.deepEqual(plain(last(environment, 'DzListBox').items), ['Existing', 'B']);
        environment.g.setSelection([a]); click(environment, 'Add Selected Children'); return true;
    }];
    assert.deepEqual(plain(childDialog(environment, config()).config.protectedChildren[0].children), ['Existing', 'B', 'A']); noSceneWrites(environment);
});
test('removal is preserved when a different selected child is subsequently added', () => {
    const graph = graphFixture(), figure = graph.figure(), hat = graph.add('Hat', 'DzNode', figure), environment = graph.environment(config(), [hat]);
    environment.g.steps = [() => {
        last(environment, 'DzListBox').setSelected(0, true); click(environment, 'Remove Protection');
        click(environment, 'Add Selected Children'); return true;
    }];
    assert.deepEqual(plain(childDialog(environment, config()).config.protectedChildren[0].children), ['Hat']); noSceneWrites(environment);
});
test('Add then Remove then Save does not re-add currently selected protection', () => {
    const graph = graphFixture(), figure = graph.figure(), hat = graph.add('Hat', 'DzNode', figure), value = config(), environment = graph.environment(value, [hat]);
    environment.g.steps = [() => {
        click(environment, 'Add Selected Children'); const list = last(environment, 'DzListBox');
        list.setSelected(list.items.indexOf('Hat'), true); click(environment, 'Remove Protection'); return true;
    }];
    assert.deepEqual(plain(childDialog(environment, value).config), value); noSceneWrites(environment);
});
test('invalid selection shows a reason and Save cannot apply a partial draft', () => {
    const graph = graphFixture(), figure = graph.figure(), hat = graph.add('Hat', 'DzNode', figure), stale = graph.add('Gone', 'DzNode', figure), environment = graph.environment(config(), [hat, stale]);
    environment.g.nodes = environment.g.nodes.filter(node => node !== stale);
    environment.g.steps = [() => {
        click(environment, 'Add Selected Children'); assert.deepEqual(plain(last(environment, 'DzListBox').items), ['Existing']);
        assert(environment.g.widgets.some(widget => widget.kind === 'DzLabel' && widget.text.includes('unavailable'))); return true;
    }];
    assert.deepEqual(plain(childDialog(environment, config()).config), config()); noSceneWrites(environment);
});
for (const action of ['add', 'remove']) test('child Cancel discards ' + action + ' without saving', () => {
    const graph = graphFixture(), figure = graph.figure(), hat = graph.add('Hat', 'DzNode', figure), value = config(), before = plain(value), environment = graph.environment(value, [hat]);
    environment.g.steps = [() => {
        if (action === 'add') click(environment, 'Add Selected Children');
        else { last(environment, 'DzListBox').setSelected(0, true); click(environment, 'Remove Protection'); }
        return false;
    }];
    assert.equal(childDialog(environment, value).saved, false); assert.deepEqual(value, before); assert.equal(environment.g.saved.length, 0); noSceneWrites(environment);
});
for (const saveParent of [false, true]) test('parent ' + (saveParent ? 'Save commits' : 'Cancel discards') + ' accepted child draft', () => {
    const graph = graphFixture(), figure = graph.figure(), hat = graph.add('Hat', 'DzNode', figure), value = config(), before = plain(value), environment = graph.environment(value, [hat]);
    environment.g.steps = [
        () => { last(environment, 'DzListBox').setSelected(0, true); click(environment, 'Protected Children...'); return saveParent; },
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
        () => { last(environment, 'DzListBox').setSelected(0, true); click(environment, 'Protected Children...'); return true; },
        () => { click(environment, 'Add Selected Children'); return true; },
        () => {
            const lists = environment.g.widgets.filter(widget => widget.kind === 'DzListBox');
            assert(lists[0].items[0].includes('protected children: 2'));
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
        last(environment, 'DzListBox').setSelected(0, true);
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
        click(environment, 'Add Selected Figure'); assert(last(environment, 'DzListBox').items[0].startsWith('ActualInternal '));
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
test('owner bones foreign profiles and unattached props are skipped with labels and reasons', () => {
    const graph = graphFixture(), figure = graph.figure(), bone = graph.add('hip', 'DzBone', figure), foreign = graph.figure('Other'), foreignChild = graph.add('OtherHat', 'DzNode', foreign), prop = graph.add('Loose'), valid = graph.add('Hat', 'DzNode', figure), environment = graph.environment(config(), [figure, bone, foreignChild, prop, valid]), result = bulk(environment);
    assert(result.ok, result.message); assert.equal(result.added, 1); assert.equal(result.skipped.length, 4);
    for (const skip of result.skipped) { assert(skip.label.startsWith('Visible ')); assert(skip.reason.length); }
    assert(result.message.includes('Skipped 4')); noSceneWrites(environment);
});
test('all ineligible live selections are explained without altering protection', () => {
    const graph = graphFixture(), figure = graph.figure(), bone = graph.add('hip', 'DzBone', figure), environment = graph.environment(config(), [figure, bone]), result = bulk(environment);
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
    const value = config(); value.supportedFigures = []; value.protectedChildren = [{figure: name, children}];
    const environment = graph.environment(value, [figure]), result = environment.support.addSupportedFigure(value, figure);
    assert(result.ok, result.message); assert.deepEqual(plain(result.config.protectedChildren), value.protectedChildren); noSceneWrites(environment);
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

const failures = tests.filter(item => !item.pass).map(({name, message, stack}) => ({name, message, stack}));
console.log(JSON.stringify({passed: tests.length - failures.length, failed: failures.length, failures}));
process.exitCode = failures.length ? 1 : 0;
