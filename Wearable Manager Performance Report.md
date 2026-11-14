# Startup and interoperability correction — 2026-10-12

This report supersedes the performance and foreign-metadata restrictions in the earlier polish report.

## Native timing

DAZ Studio 4, one isolated GUI instance, synthetic scene with 1,601 native nodes: one Genesis9-named DzFigure, 180 figure bones, 20 DzNode garments with 70 bones each. The same scene is rebuilt for Menu and Take Off; Put On restores the preceding Take Off operation. Both transfer passes verify all 20 root parents afterward.

| Script | Before this correction | After | Speedup |
|---|---:|---:|---:|
| Menu | 40,919 ms | 620 ms | 66.0× |
| Take Off | 47,794 ms | 652 ms | 73.3× |
| Put On | 5,965 ms | 177 ms | 33.7× |

Menu executes its real initialization and widget construction; only its final modal `exec()` is bypassed to exclude human waiting. The launcher copies substitute absolute resource paths. Take Off/Put On execute their actual transfer code. Baseline copies were taken immediately before this correction, not from the historical Git release. Application startup is excluded. These are individual native measurements, not a guarantee for arbitrary geometry, shells, simulations or libraries.

DAZ Studio 6 also completed the new Menu/Take Off/Put On cycle and verified all 20 transfers. The final recorded timings were 108/148/190 ms. Its include compilation reruns diagnostic prefix statements; DAZ 4 is the controlled before/after comparison above.

Local diagnostic evidence is under `.test-output`: `native-launchers.txt`, `native6-launchers.txt`, `native-export.txt`, `native-metadata.txt`, generated harnesses and baseline snapshots. These diagnostic files are ignored and are not product assets.

## Cause and implementation

- Nested-figure preflight previously enumerated and rebuilt the entire scene index for every bone. It now rejects non-figure node types before native lookup.
- Individual live-node and figure checks now use DAZ's current `findNodeByElementID` result. They do not retain a cache across dialogs, events or mutations. All four WM launchers share this correction.
- Transfer protection validates the actual current subtree and ancestry instead of scanning unrelated scene hierarchies for every candidate. Native child counts, live identities, parent consistency, cycles, protected descendants and custom graft checks remain enforced.
- Read snapshots use DAZ's own identity index. Hosts without that API retain the previous explicit index. Full snapshot audits retain reverse-parent membership verification.

## Interoperability

Wardrobe now ignores tagged items inside a WM storage group, including nested bone proxies and composite parts. The same item becomes eligible again when Put On returns it to its original figure. WM continues to operate on its own storage and active figure attachments, not Wardrobe's separate top-level storage.

Prior WM use no longer blocks Wardrobe registration/export, adding an unregistered composite child, or Wardrobe transfer. Export temporarily detaches the exact `MatewWearables` data object from source nodes, then restores it in `finally`, including on save/validation failure. Runtime WM IDs are therefore not cloned into library presets. Native wearable export confirmed Wardrobe metadata in the output, absence of WM runtime metadata, and restoration of source identities.

Actual pending recovery records, incompatible owner changes and concurrent open managers remain checked. These checks distinguish unfinished work from harmless historical identity/transfer metadata. Settings files, library schema, catalog IDs and stored presets require no migration or rewrite.

## Validation and limits

Portable suite: **1,447 passed, 0 failed, 2 pre-existing skips**. New regressions enforce zero full-scene scans for per-bone startup checks and individual native lookups, fresh protection after subtree mutation, storage/return visibility, and export cleanup after success or failure.

Native tests used isolated synthetic scenes and a test-only exported preset. Existing user scenes and Wardrobe libraries were not opened or rewritten. Full Wardrobe interaction with the user's real clothing, material/shell recovery and visual badge review remain manual acceptance checks.

Further optimization should be driven by timings of actual remaining slow actions. Large-library catalog parsing and Menu row construction are potential next targets; the startup scene-scan regression is now removed.

## Fitted-root parent compatibility correction

The existing Jacket 03a definition uses `parent: none` and `follow: figure`. WM Put On returns it directly under the same figure. Wardrobe now accepts these two parent forms only for a root whose saved and actual Fit To both identify that same figure. Bone/part parents, foreign owners, unfitted props and all other reference fields retain exact checks.

The same rule applies to recovery validation (using the captured Fit To, since a stored item is detached) and composite checks. Recovery still records and restores the actual parent exactly. Existing catalogs and presets are not rewritten. The portable suite now passes 1,468 checks, with zero failures and two pre-existing skips.

## Transfer after resetting source set properties

The reported Jacket transfer reset Scale from 1.05 to 1, then incorrectly compared the garment against its pre-reset snapshot (`TRANSFER_SOURCE_UNCHANGED`). The supplied report confirms successful rollback, including restoration of the original property value.

The transfer boundary now checks the original source state before resetting properties, validates structural/reference/identity/material invariants afterward, and captures a separate post-reset forward-verification baseline for source items. Full-profile forward pose checks likewise use the post-reset pose. Original rollback measurements and poses remain unchanged. This also covers remaining source items affected by property dependencies; later unexpected changes still fail verification.

## Fitted Scale write correction

The next supplied report shows that transfer itself succeeds, then applying Scale fails: saved evaluated native 1.05 reads back as 1.032674959. An isolated DAZ reproduction confirmed that Fit To multiplies the raw garment scale by the recipient figure's scale (0.9835). Repeating setValue does not fix it.

Property overrides now use the native adjustValue conversion for SCALE transforms. DAZ 4 writes the adjusted raw value with setRawValue; DAZ 6 lacks that setter and uses its available scale setValue with the adjusted value. The original evaluated readback tolerance, bounds checks and failure behavior remain. Rollback uses the same conversion, restoring both original evaluated and raw scale after returning to a differently scaled source. Other property types retain their existing setter. Saved library values keep their existing evaluated-native meaning; no catalog migration or settings changes.

Native DAZ 4 and DAZ 6 tests cover source Scale 0.91, recipient Scale 0.9835, Jacket-style unparented Fit To, reset to 1, apply 1.05, and exact raw/evaluated restoration. Observed recipient value is 1.049999974449122 with raw 1.0676156282424927. Portable suite: 1,486 passed, zero failures, two pre-existing skips.

Full DAZ 6 action verification also passed with the real Jacket preset and a copied revision-175 catalog: import/apply on one Genesis 8.1 Female, transfer of the same live Jacket to a second Genesis 8.1 Female at Scale 0.9835, and evaluated garment Scale 1.05. A test-only injected failure after property application during reverse transfer exercised the full rollbackAction path. The Jacket returned to its prior owner with its original evaluated and raw Scale; the injected failure was the only failure reported. Original library/catalog/presets were read only. Evidence: `.test-output/native-full-scale.txt` and `.test-output/scale-library-mapped/Logs/`.

DAZ 4 native setter/rollback verification passed. Full import of the copied existing catalog in DAZ 4 was blocked by its separate DrawStyleOverride material compatibility check; this change does not relax that check. The complete real-item action/rollback proof above was performed in DAZ 6.
