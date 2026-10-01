# Safe checkpoint - build remains unfinished

The continuation is paused at the parent's request. Product writes remain confined to D:\Tests\DAZ Test Folder\Scripts\matew\Wearables Manager 2. The original sibling Wearables Manager has all 146 original names, lengths and SHA-256 hashes unchanged. No existing DAZ scene/process, installed toolbar, credentials, security setting or Git global setting was changed. Remote setup remains deferred; no push occurred.

## Installed and committed

- Baseline 1d15974476ccecaa30f8fe690a9bee6e991194bc.
- Initial repair c686a279e2f0dfa70c0a9ab071c915b4897dcb21; initial checkpoint f3bb4567fbdaeeef578f2ce4747a743f6b911d95.
- Alias/queue correction 8d3fc75: all four engines compare nodes by native session identity with a separate live membership check. Exact helper diagnostics now recognize DAZ4 constructor/enumeration aliases and save stable references in both DAZ4 and DAZ6.
- Regression/evidence commit cd19f56: installed portable checks pass 379/379, with 2 explicit skips. Queue ownership groups aliases and validates every owner before cleanup; additional native queue coverage is pending.

The installed product still uses the earlier raw metadata helpers and strict numeric export-result check. The next metadata/error-code repair is preserved in scratch only. Do not treat its native persistence results as validation of installed code or as full release approval.

## Native proof for the uninstalled candidate

Candidate Take Off SHA-256: 6565d59cffa9669c5c3be3ea06f165c196e3fe73a4ca0e766c5343b509ae5b4a.

DAZ4 4.24.0.4 and DAZ6 6.25.2026.14722 each passed all five sealed persistence cases: exact source identity; Unicode code-point and hidden user string-property scene save/reload; actual authoritative metadata bridge migration/persistence with untouched legacy fields; actual material snapshot/color/default-UV restoration on disposable triangle geometry; unselected-shell RootLabel targeting with multiple selected nodes and selection preservation. No real graft/shader content was loaded and alternate UVs were unavailable.

DAZ4 actual exporter success/failure proves Number(raw DzError) unsafe: both convert to zero, whereas explicit valueOf() yields primitive 0 and 98. The candidate normalizes that typed primitive at direct documented API call sites, checks success code and readable output, and passes real DAZ4/6 export/restore. Native DzError exposes no uniquely observable public brand; call sites stay narrow.

Separate capability fixtures in both versions prove existing hidden native string-property values Undo/Redo/cancel correctly, and property creation inside a hold is physically removed by Undo/cancel. The bridge uses property-absence-only legacy fallback, an authoritative empty value, and a detached before-state journal with explicit failed-compensation diagnostics. Actual integrated bridge Undo/Redo and failure compensation still need native behavior tests.

Scratch checks: 92 actual bridge tests, 102 storage plus 2 skips, 28 queue, 72 graph, 48 alias, 40 integration and 56 controls pass. Flow suites explicitly mock the bridge contract; they do not replace actual bridge/native validation.

## Resume before installing the candidate

1. Complete and run the prepared native behavior fixture on both versions: actual metadata Undo/Redo/cancel, parent/FitTo/collision relations, queue aliases, minimal bone membership and owner resurrection, controls and animated-emissive policy.
2. If those pass, install only the five candidate scripts after exact current installed hash checks, run the packaged aggregate against the actual installed sources, and repeat the bounded native proof against installed files.
3. Verify all 146 original hashes again, then commit the validated source and regression changes logically. Keep named loadouts and Archmage integration outside this repair.

No WM-owned native process remains. The untouched user processes are DAZ6 PID 57872 (start UTC 2026-09-26T01:58:22.2583422Z) and DAZ4 PID 177096 (start UTC 2026-10-01T03:32:28.1437405Z). Native ownership is released at this checkpoint.

## Evidence and preserved experiments

Scratch root: C:\Users\Andrii\Documents\Codex\2026-10-01\task\wm-audit\implementation.

- continuation-checkpoint.json: exact installed/candidate inventories and pause state.
- original-full-after-checkpoint.json: final 146-file original preservation proof.
- compat/native/wm_audit_f0b1352d99024a5da4473fe4e24614dc/results.json: DAZ4 persistence.
- compat/native/wm_audit_8a5c5e9438e74f2da99a03fa65f3a549/results.json: DAZ6 persistence.
- compat/native-persistence.proposed.dsa: sealed SHA-256 051f7fdcf71f77a06ddf8023799641e1949704e835491455b6f4adc42df9f174.
- storage/wm2-metadata-bridge-proposal.dsa and prepare-metadata-bridge.cjs: repair source and exact generator.
- candidate/: complete uninstalled candidate. integrate.cjs rebuilds it from the preserved baseline.
- graph/native_graph_checks_fragment.dsa and controls/native_controls_fragment.dsa: prepared actual-source native checks; their combined behavior execution remains pending.
- deliverables/Tests/: refreshed portable checks for the candidate, not yet installed; the repository's installed checks remain at the committed 379-pass checkpoint.
