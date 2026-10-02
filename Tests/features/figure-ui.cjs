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
function nativeLikeFigure(internalName = 'Custom', id = '100') {
    return {
        name: 'Different name fallback', getName: () => internalName, elementID: id,
        className: () => 'DzFigure', inherits: type => ['DzNode', 'DzSkeleton', 'DzFigure'].includes(type),
        getFollowTarget: () => null, getNodeParent: () => null, getNodeChildren: () => [], getLabel: () => 'Different visible label'
    };
}

test('reused prefixes define helpers without constructing dialogs or accessing IO', () => {
    const environment = ui.environment();
    assert.equal(environment.g.widgets.length, 0);
    assert.equal(environment.g.ioCalls, 0);
    assert.equal(environment.g.sceneReads, 0);
    noSceneWrites(environment);
});
test('manual pending child is applied on Save to a returned clone only', () => {
    const value = config(), before = plain(value), environment = ui.environment({config: value});
    environment.g.steps = [() => { last(environment, 'DzLineEdit').text = 'Hat'; return true; }];
    const result = childDialog(environment, value);
    assert(result.saved);
    assert.deepEqual(plain(result.config.protectedChildren), [{figure: 'Custom', children: ['Existing', 'Hat']}]);
    assert.deepEqual(value, before);
    assert.equal(environment.g.saved.length, 0);
    noSceneWrites(environment);
});
test('invalid pending child blocks Save and Cancel keeps caller state', () => {
    const value = config(), before = plain(value), environment = ui.environment({config: value});
    environment.g.steps = [
        () => { last(environment, 'DzLineEdit').text = '   '; return true; },
        () => {
            assert.equal(last(environment, 'DzLineEdit').text, '   ');
            assert(environment.g.widgets.some(widget => widget.kind === 'DzLabel' && widget.text.includes('nonempty')));
            return false;
        }
    ];
    assert.equal(childDialog(environment, value).saved, false);
    assert.deepEqual(value, before);
    assert.equal(environment.g.saved.length, 0);
});
test('explicit Add then Remove then Save does not re-add protection', () => {
    const value = config(), environment = ui.environment({config: value});
    environment.g.steps = [() => {
        last(environment, 'DzLineEdit').text = 'Hat'; click(environment, 'Protect Name');
        assert.equal(last(environment, 'DzLineEdit').text, '');
        const list = last(environment, 'DzListBox');
        list.setSelected(list.items.indexOf('Hat'), true); click(environment, 'Remove Protection');
        return true;
    }];
    const result = childDialog(environment, value);
    assert(result.saved);
    assert.deepEqual(plain(result.config), value);
});
test('removing an existing name also clears identical pending input', () => {
    const value = config(), environment = ui.environment({config: value});
    environment.g.steps = [() => {
        last(environment, 'DzLineEdit').text = 'Existing';
        last(environment, 'DzListBox').setSelected(0, true); click(environment, 'Remove Protection');
        assert.equal(last(environment, 'DzLineEdit').text, ''); return true;
    }];
    const result = childDialog(environment, value);
    assert(result.saved);
    assert.deepEqual(plain(result.config.protectedChildren), [{figure: 'Custom', children: []}]);
});
for (const action of ['add', 'remove']) test('child Cancel discards ' + action + ' without saving', () => {
    const value = config(), before = plain(value), environment = ui.environment({config: value});
    environment.g.steps = [() => {
        if (action === 'add') { last(environment, 'DzLineEdit').text = 'Hat'; click(environment, 'Protect Name'); }
        else { last(environment, 'DzListBox').setSelected(0, true); click(environment, 'Remove Protection'); }
        return false;
    }];
    assert.equal(childDialog(environment, value).saved, false);
    assert.deepEqual(value, before);
    assert.equal(environment.g.saved.length, 0);
    noSceneWrites(environment);
});
for (const saveParent of [false, true]) test('parent ' + (saveParent ? 'Save commits' : 'Cancel discards') + ' accepted child draft', () => {
    const value = config(), before = plain(value), environment = ui.environment({config: value});
    environment.g.steps = [
        () => { last(environment, 'DzListBox').setSelected(0, true); click(environment, 'Protected Children...'); return saveParent; },
        () => { last(environment, 'DzLineEdit').text = 'Hat'; return true; }
    ];
    assert.equal(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved, saveParent);
    assert.deepEqual(value, before);
    assert.equal(environment.g.saved.length, saveParent ? 1 : 0);
    if (saveParent) {
        assert.deepEqual(plain(environment.g.saved[0].config.protectedChildren), [{figure: 'Custom', children: ['Existing', 'Hat']}]);
        assert.deepEqual(plain(environment.g.saved[0].config.iconRules), value.iconRules);
        assert.equal(environment.g.saved[0].expectedRawToken, 'baseline-token');
    }
    noSceneWrites(environment);
});
test('failed parent Save retains protected draft before Cancel', () => {
    const value = config(), environment = ui.environment({config: value, saveFailure: true});
    environment.g.steps = [
        () => { last(environment, 'DzListBox').setSelected(0, true); click(environment, 'Protected Children...'); return true; },
        () => { last(environment, 'DzLineEdit').text = 'Hat'; return true; },
        () => {
            const lists = environment.g.widgets.filter(widget => widget.kind === 'DzListBox');
            assert(lists[0].items[0].includes('protected children: 2'));
            assert(environment.g.widgets.some(widget => widget.kind === 'DzLabel' && widget.text === 'Forced save failure'));
            return false;
        }
    ];
    assert.equal(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved, false);
    assert.equal(environment.g.saved.length, 1);
    assert.deepEqual(plain(environment.g.saved[0].config.protectedChildren), [{figure: 'Custom', children: ['Existing', 'Hat']}]);
    noSceneWrites(environment);
});
for (const status of ['future-schema', 'unreadable', 'path-error']) test(status + ' disables all figure edits and Save', () => {
    const environment = ui.environment({config: config(), status, readOnly: true});
    environment.g.steps = [(_, dialog) => {
        last(environment, 'DzListBox').setSelected(0, true);
        for (const text of ['Protected Children...', 'Remove', 'Add Selected Figure', 'Reset Genesis Defaults']) {
            assert.equal(environment.button(text).enabled, false);
        }
        assert.equal(dialog.acceptButton.enabled, false); return false;
    }];
    assert.equal(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved, false);
    assert.equal(environment.g.saved.length, 0);
    assert.equal(environment.g.sceneReads, 0);
    noSceneWrites(environment);
});
for (const useBone of [false, true]) test('actual getName identity displayed and saved from ' + (useBone ? 'selected bone owner' : 'selected figure'), () => {
    const figure = nativeLikeFigure('ActualInternal');
    const bone = {
        name: 'WrongBoneFallback', getName: () => 'jaw', elementID: '101', className: () => 'DzBone',
        inherits: type => ['DzNode', 'DzBone'].includes(type), getNodeParent: () => figure, getSkeleton: () => figure,
        getLabel: () => 'Different bone label'
    };
    const value = config(); value.supportedFigures = []; value.protectedChildren = [];
    const environment = ui.environment({config: value, nodes: useBone ? [figure, bone] : [figure], selected: useBone ? bone : figure});
    environment.g.steps = [() => {
        click(environment, 'Add Selected Figure');
        assert(last(environment, 'DzListBox').items[0].startsWith('ActualInternal '));
        assert(environment.status().text.includes('Internal name: ActualInternal | Visible label: Different visible label'));
        return true;
    }];
    assert(environment.context.WM2ShowSupportedFigures('C:/scratch/Resources').saved);
    assert.deepEqual(plain(environment.g.saved[0].config.supportedFigures), ['ActualInternal']);
    noSceneWrites(environment);
});
test('Use Selected Child uses getName rather than label or name fallback', () => {
    const figure = nativeLikeFigure(), child = {
        name: 'WrongChildFallback', getName: () => 'ActualChild', elementID: '101', className: () => 'DzNode',
        inherits: type => type === 'DzNode', getNodeParent: () => figure, getLabel: () => 'Visible child label'
    };
    const value = config(), environment = ui.environment({config: value, nodes: [figure, child], selected: child});
    environment.g.steps = [() => {
        click(environment, 'Use Selected Child');
        assert.equal(last(environment, 'DzLineEdit').text, 'ActualChild'); return true;
    }];
    const result = childDialog(environment, value);
    assert(result.saved);
    assert.deepEqual(plain(result.config.protectedChildren), [{figure: 'Custom', children: ['Existing', 'ActualChild']}]);
    noSceneWrites(environment);
});
test('Restore Genesis Protection merges defaults without losing custom names', () => {
    const value = config(); value.supportedFigures = ['Genesis9'];
    value.protectedChildren = [{figure: 'Genesis9', children: ['CustomProtected']}];
    const environment = ui.environment({config: value});
    environment.g.steps = [() => { click(environment, 'Restore Genesis Protection'); return true; }];
    const result = childDialog(environment, value, 'Genesis9');
    assert(result.saved);
    const names = plain(result.config.protectedChildren[0].children);
    assert(names.includes('CustomProtected'));
    const genesis = defaults.protectedChildren.find(profile => profile.figure === 'Genesis9');
    for (const name of genesis.children) assert(names.includes(name));
    assert.deepEqual(value.protectedChildren, [{figure: 'Genesis9', children: ['CustomProtected']}]);
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
