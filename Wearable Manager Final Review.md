# Wearable Manager final review — 2026-10-12

The current source build is ready for the user's real-work acceptance pass. This review found and corrected redundant Wardrobe startup work and an icon-import collision introduced by the split image folders. It does not certify every possible DAZ scene or third-party asset.

## Wardrobe startup

Measured in separate DAZ Studio 6 instances using the same copied revision-175 library (24 sets), a test figure of type Genesis8_1Female, the real registered Jacket preset, and background nodes bringing the scene to 1,601 nodes. Six sets match the selected figure. The native main window widgets were actually constructed; the benchmark returned just before the modal dialog. Scene setup, application launch and time spent using the dialog are excluded. These are individual local measurements, not a guaranteed load time for other libraries/scenes.

| Measurement | Before | After |
|---|---:|---:|
| Startup preparation, including catalog and window construction | 580 ms | 236 ms |
| Catalog reads / validations | 2 / 2 | 1 / 1 |
| Catalog read + validation time | 232 ms | 92 ms |
| Main window construction | 341 ms | 138 ms |
| Outfit card images constructed | 24 | 6 |
| Outfit summary reads | 2 | 1 |
| Inventory reads | 3 | 2 |
| Script evaluation / declaration initialization, measured separately | 81 ms | 80 ms |

The main preparation stage is approximately 2.46 times faster. Including the separate initialization measurement gives approximately 661 → 316 ms. Wardrobe is about 1 MB of source versus about 125 KB for Menu; that contributes to startup, but redundant catalog reads and hidden card construction were more significant in this fixture.

The first successful catalog validation is reused only before crossing a dialog/event boundary. Subsequent dialog opens and actions still read the shared catalog again. Only sets compatible with the selected figure get widgets; changing the selected figure recreates the dialog. The initial outfit summary is reused during the same synchronous construction phase. Search and group selection filter existing display snapshots without rescanning materials/properties; scene actions and dialog reopen refresh diagnostics and operation preflight remains unchanged. No persistent scene-handle cache was added.

## Other review result

The split image layout resolves all packaged PNG references. A new PNG imported into Default Items could previously be shadowed by an exact same-named PNG in Resources, whose resolver precedence is intentional for compatibility. Import now detects this collision across both directories, offers the existing rename/cancel flow, and reuses an explicitly selected existing Resources file without copying. It never overwrites either file.

Existing settings and library schemas, scene IDs, saved values, transfers, recovery, Fit To and material checks were not changed in this review. Menu/Full/Put On/Take Off retain the earlier native lookup and subtree performance fixes. The prior real-Jacket transfer and rollback proof is documented in Wearable Manager Performance Report.md.

## Validation and remaining work

Portable suite: 1,495 passed, zero failures, two pre-existing skips. Added checks cover compatible card selection (type/label/exact figure), catalog refresh after figure/settings changes, failed initial catalog recovery, lightweight filtering versus scene refresh, and cross-directory image collisions. The native before/after benchmark used the actual current mainDialog code and a real registered garment. Evidence is under ignored .test-output/wardrobe-launch-before.json, wardrobe-launch-after.json, and wardrobe-parse-*.txt.

The user has confirmed the preceding corrections work. The next useful work is the planned acceptance pass on real scenes. Further optimizations should follow actual slow cases: many simultaneously worn sets with material snapshots may still spend time reading live materials; very large libraries may justify a lazy card list. There is no reason from these measurements to split the script into modules or introduce a persistent scene cache now.

For packaging, include current DSA entry points, their launcher images, Resources and Default Items. Exclude .test-output, Tests, LegacyCompiled and personal settings such as the ignored WM2 Settings.json. Archived checkpoint/audit documents describe earlier revisions; they are not current build status.
