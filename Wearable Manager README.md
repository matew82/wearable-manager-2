# Wearable Manager 2

Current source build and final review: [Wearable Manager Final Review.md](Wearable%20Manager%20Final%20Review.md). Native timing, compatibility fixes and validation evidence are in [Wearable Manager Performance Report.md](Wearable%20Manager%20Performance%20Report.md).

Launch the current DSA files: Menu, Full (All), Take Off, Put On, Wardrobe, Icon Rules, Supported Figures and User Guide. Their filenames begin with Wearable Manager. LegacyCompiled contains archived implementations and must not be distributed as current launchers. External toolbar shortcuts must point to the current filenames.

Default Items contains item images. Resources contains button icons, shared scripts and JSON configuration. Saved legacy image names and settings filenames remain supported. New icon imports use Default Items and never overwrite an existing image in either directory.

The CHECKPOINT and AUDIT-COVERAGE documents are historical baseline records, not current build status. The current build is ready for the planned real-work acceptance pass; see Final Review for exactly what has been verified.

Recovery now checks backup I/O before detaching wearables, restores parents before FitTo and collision relationships, and removes recovery metadata only after successful application. Missing or ambiguous references stop recovery and retain the records. New node references use persistent IDs; duplicate IDs are rejected. Existing name/label references work when uniquely resolvable. A legacy bone-shaped storage group requires explicit review before adoption. Ordinary user groups are preserved.

New shell backups are stored beneath `App.getAppDataPath()/matew/WearablesManager/Backups/`; the full path is saved with the recovery record. Legacy scenes keep their existing temporary-path fallback. Physical backups are retained after successful restoration so Undo and retry cannot lose the file. No automatic cleanup is performed, so retained backups can accumulate. Wardrobe Settings now has an orange **Clear cache (X MB)** button below **GeoShell Material Recovery** for this sidecar directory only. The source checks every current scene node for pending recovery and requires an explicit warning confirmation before deletion. Return all affected items in all scenes first: unopened saved scenes and Undo/Redo may still need these files, and deletion cannot be undone. Wardrobe library `Materials/`, saved outfits and presets are never cleaned by this button. Linked, redirected or unreadable cache paths are rejected. A partial cleanup reports the error and refreshes the remaining size; only a verified empty folder displays disabled **Cache empty**. A pending snapshot is preserved; adding new shell surfaces or changing saved UVs requires restoring the previous operation first.

Visibility, smoothing, Freeze, light and emissive controls apply immediately and have separately labelled Undo blocks. The dialog button says **Cancel Transfer** to make its scope clear. Invalid emissive metadata is retained and refused instead of overwritten. Icon configuration is validated without rewriting the user's configuration during startup.

Run the portable checks from this folder:

```powershell
node 'Tests/Wearable Manager run.cjs'
```

The checks require Node.js 20+ and Git. They extract functions from these actual scripts, export the original scripts from baseline commit `1d15974476ccecaa30f8fe690a9bee6e991194bc`, and write results beneath ignored `.test-output/`. They launch no DAZ instance and modify no scene or installed configuration. See [Wearable Manager AUDIT-COVERAGE.md](Wearable Manager AUDIT-COVERAGE.md) for coverage and limits.

Native DAZ 4/6 evidence and its scope are recorded in the current reports. Automated checks and the tested fixtures do not constitute exhaustive coverage of all figures, shaders, animation and scene configurations.

## Material cache update (2026-11-07)

Wardrobe version 0.9.10.45 is encoded in both the source package and the installed WM2 folder. Reopen Wardrobe to load the new build.

Validation: 59 dedicated source-extracted cache tests passed using a synthetic in-memory filesystem. The aggregate portable suite reports 1,554 passed, six pre-existing failures and two existing skips. All six failures were reproduced using the preserved pre-change Wardrobe source: three startup export tests lack `DATA`, two restore-prompt tests lack `userErrorText`, and one wardrobe-launch compatibility fixture differs from current label-scope behavior. Those unrelated fixtures/behaviors were not changed.

Separate, uniquely named DAZ Studio 4.24 and 6.25 instances passed native size, nested synthetic cleanup, scene-metadata guards, button-state/style and actual Settings widget construction checks. The test Settings dialog measured 820 x 476. Only synthetic files under the task scratch folder were deleted. No real material cache or library was cleaned, no user scene was loaded or changed, and existing DAZ processes were preserved. Native confirmation-click flows remain covered by portable mocks rather than an interactive user acceptance run.

The DAZ4-encoded candidate, package DSE and installed DSE have identical SHA-256: `346F6848C5F88CBBA4E6899FBE02F80558FECA99EAE5A3630BF3C7EF627901C4`. The final source SHA-256 is `3F718EEAD9C5336891DD26D511764A0606E49BBB6A89A0F02442BFA62D318DA7`.

The cleanup rejects linked/redirected paths and revalidates each file and its parents immediately before removal. Native scripting APIs cannot completely eliminate a race if an external program replaces a path between validation and removal; do not change the cache directory while cleaning it.