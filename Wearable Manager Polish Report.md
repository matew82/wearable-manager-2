# Wearable Manager — polish, 2026-10-12

The current source entry points are `Wearable Manager Full.dsa`, `Wearable Manager Menu.dsa`, `Wearable Manager Take Off.dsa`, `Wearable Manager Put On.dsa`, `Wearable Manager Wardrobe.dsa`, `Wearable Manager Icon Rules.dsa`, `Wearable Manager Supported Figures.dsa`, and `Wearable Manager User Guide.dsa`.

## Packaging and references

All packaged files, development tests and documents now begin with `Wearable Manager`. Resources, includes, JSON icon-map keys, dynamically constructed mode-button image names, documentation links and test imports use the new names. The historical `Coffe` image is now `Wearable Manager - Coffee.png`, matching its map key. Partial Apply uses the supplied OK image instead of probing two absent Apply images. The file-name and image-reference audit runs in the portable suite.

`.gitignore`, Git metadata and ignored local test output are development infrastructure. Existing ignored `Resources/WM2 Settings.json` is user data, not a distribution asset. Do not ship personal preferences, `.test-output`, or `LegacyCompiled`. The renamed archived DSE files still contain their historical compiled implementation and are not current launchers. Existing external DAZ shortcuts to old script filenames need to be pointed at the new DSA files; this change does not edit installed shortcuts.

## Compatibility

- New settings are saved as `Resources/Wearable Manager Settings.json`. An existing `WM2 Settings.json` remains authoritative, including when both names exist. Read, explicit Save, conflict detection, future-schema refusal and backup handling all use that same existing file. Loading performs no migration writes.
- Schema 1/2 settings preserve saved figure names, protected children, disabled rules and old icon filenames. The settings editor no longer marks a renamed built-in image as missing. Both the shared resolver and Wardrobe resolve legacy image names at read time; an existing file with the exact saved name takes precedence.
- An existing `Wearables Manager.json` automatic icon map takes precedence over the newly named shipped map, retaining installation-specific edits.
- Wardrobe preference identity, library/catalog schema, library paths, relative item/material/icon filenames, revision handling, saved IDs and scene metadata are unchanged. Existing library files are not renamed or rewritten. Wardrobe's independent settings reader also honors the legacy filename and old image references.

## Performance and unused UI

Menu determines whether an item can be a visible root before running its expensive protection check. Nested objects remain covered by their root's protection check. A fixture with one root and 80 nested details reduces protection calls from 81 to 1; introducing a protected nested child still excludes that root.

Shared subtree validation now detects repeated identities using an index rather than comparing each node with every preceding node. This applies to all consumers of the shared protection logic. Transfer-time validation remains fresh; no scene snapshot is cached across mutations.

The common icon resolver builds its two immutable map-key arrays once per resolver. Menu tag loading no longer allocates a directory object with unreachable cleanup. Wardrobe computes its Resources directory once per invocation while continuing to check actual files.

Nine unreferenced, private Wardrobe UI functions were removed after checking symbol references: `supportedFiguresDialog`, `propertyOverrideEditDialog`, `helpDialog`, `showCardPropertyDetails`, `displayEditorPixmap`, `galleryButtonPixmap`, `selectEditorShown`, `propertyOverrideDisplay`, and `setButtonIcon`. Active settings, property, material and figure interfaces remain. Public shared UI entry points were retained.

## Verification

Run from this directory:

```powershell
node 'Tests/Wearable Manager run.cjs'
```

The final run passed 1,389 checks with zero failures and two pre-existing skips. The suite parses all DSA files, including Wardrobe, and runs source-extracted behavior and filesystem/widget mocks. New tests cover old settings load/save, concurrent changes, future schemas, both image resolvers, Wardrobe settings compatibility, image-map integrity, filename compliance and Menu protection-call counts.

Native DAZ startup timing, widget rendering and opening a real existing Wardrobe library were not exercised. The call-count result is not a wall-clock speedup claim. The pre-existing native verification limitations and two skipped cases still apply; this report is not a release certification.

## Wardrobe membership and interoperability update

Menu and Full (All) now show a 24×24 informational outfit badge next to each registered item or composite part belonging to one or more sets in the **currently configured Wardrobe library**. The tooltip lists all those sets. It matches LibraryID, ItemID, VariantID, PartID and role; labels and asset filenames are not used to guess membership. Merely registered items that belong to no set have no badge. Items belonging to another library require selecting that library in Wardrobe first.

`Resources/Wearable Manager Wardrobe Bridge.dsa` reads preferences, the library header and the latest immutable catalog without executing Wardrobe or writing anything. Catalog data is loaded only when a registered row needs it, indexed once per dialog, and refreshed on the next opening. Both columns share one decoded 24×24 pixmap. Missing, forked, oversized or unsupported catalog data suppresses badges and writes one notice to the DAZ log; normal WM controls remain available.

The two transfer systems keep independent storage groups and recovery namespaces (`MatewWearables` and `matewWardrobeSets_v1`). Following the startup/interoperability correction, Wardrobe ignores items in WM storage and accepts them again after WM returns them to the figure. Manually moving an item to another figure does not update Wardrobe ownership.

Two additional safeguards close interoperability gaps:

- All four WM transfer launchers check Wardrobe's busy flag, and Wardrobe checks WM's busy flag. Close one manager before opening the other. Each manager retains responsibility for releasing its own flag.
- WM preflights complete transfer batches and rechecks mutation entry points for Wardrobe Pending/Recovery/GeoWardrobeSnapshot records and Wardrobe storage containers. Wardrobe checks for WM's pending FitTo, collision and shell-recovery fields in inventory and before store/restore. A pending record stops the operation without deleting or adopting the other manager's metadata. Overlapping subtrees are traversed once per batch; no result is reused across scene mutations.

The former blanket restriction on `MatewWearables` metadata has been removed. Wardrobe can register/export restored WM items and transfer items with harmless WM metadata. Export excludes foreign runtime IDs temporarily and restores the source metadata in `finally`. See `Wearable Manager Performance Report.md` for current implementation, native timings and validation; earlier counts and native limitations in this polish history describe the preceding version.

The updated portable suite passes **1,438 checks, zero failures, two skips**. The 49 new checks cover badge identity and dimensions, all set names, both columns, one-time IO/image loading, corrupt/forked catalogs, batch traversal, mutual busy flags, recovery refusal before native mutations, and active → foreign storage → original owner transitions. Native DAZ rendering, startup timing and real scene round trips remain unverified.

Further optimization should follow native profiling of large scenes and libraries. The likely next targets are row/widget construction and the cost of reading catalogs containing material snapshots. A separate membership cache keyed to an immutable catalog revision could reduce the latter if measurements justify it. Recovery checks and observation windows should not be shortened merely to make the interface appear faster.
