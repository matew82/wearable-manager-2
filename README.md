# Wearables Manager 2 — local repair build

**Checkpoint: not release-ready.** Native tests exposed a DAZ4 node-wrapper comparison regression and metadata Undo/cancel gaps in both versions. See [CHECKPOINT.md](CHECKPOINT.md). Source/mocks below describe the installed repair work; native correction drafts are still pending.

This folder contains the revised source scripts and a local Git history. The original sibling `Wearables Manager` folder is preserved. This is a repair build of the existing product; it does not add outfit serialization, named loadouts, nonhuman profiles, or Archmage integration.

Launch the five `.dsa` scripts in this folder explicitly. The four supplied compiled `.dse` scripts are preserved under `LegacyCompiled/` because they still contain the old implementation. They are archived artifacts, not launch targets for this build. Existing toolbar shortcuts that point to the original folder still launch the original scripts; no installed toolbar configuration was changed. The guide launcher opens the readable sibling PDF first.

Recovery now checks backup I/O before detaching wearables, restores parents before FitTo and collision relationships, and removes recovery metadata only after successful application. Missing or ambiguous references stop recovery and retain the records. New node references use persistent IDs; duplicate IDs are rejected. Existing name/label references work when uniquely resolvable. A legacy bone-shaped storage group requires explicit review before adoption. Ordinary user groups are preserved.

New shell backups are stored beneath `App.getAppDataPath()/matew/WearablesManager/Backups/`; the full path is saved with the recovery record. Legacy scenes keep their existing temporary-path fallback. Physical backups are retained after successful restoration so Undo and retry cannot lose the file. No automatic cleanup is implemented yet, so retained backups can accumulate. Do not delete them while recovery or Undo may still need them. A pending snapshot is preserved; adding new shell surfaces or changing saved UVs requires restoring the previous operation first.

Visibility, smoothing, Freeze, light and emissive controls apply immediately and have separately labelled Undo blocks. The dialog button says **Cancel Transfer** to make its scope clear. Invalid emissive metadata is retained and refused instead of overwritten. Icon configuration is validated without rewriting the user's configuration during startup.

Run the portable checks from this folder:

```powershell
node Tests/run.cjs
```

The checks require Node.js 20+ and Git. They extract functions from these actual scripts, export the original scripts from baseline commit `1d15974476ccecaa30f8fe690a9bee6e991194bc`, and write results beneath ignored `.test-output/`. They launch no DAZ instance and modify no scene or installed configuration. See [AUDIT-COVERAGE.md](AUDIT-COVERAGE.md) for coverage and limits.

Native DAZ4/DAZ6 verification remains pending. JavaScript parsing and mocked API behavior do not establish native data-item Undo, QObject identity, geograft regeneration, animation behavior, SubD action behavior, or OS PDF launching. Use a disposable scene for that verification before relying on this repair build in production.
