# Safe checkpoint — repair build is not release-ready

Scope: all installed changes are confined to `D:\Tests\DAZ Test Folder\Scripts\matew\Wearables Manager 2`. The original sibling `Wearables Manager` was read only: all 146 files have unchanged names, lengths and SHA-256 hashes after installation. No existing DAZ scene/process, toolbar, credentials, security setting, Git global setting or remote repository was changed. Remote creation remains deferred.

Local commits:

- Baseline: `1d15974476ccecaa30f8fe690a9bee6e991194bc`.
- Repair: `c686a279e2f0dfa70c0a9ab071c915b4897dcb21` — five `.dsa` changes, four unchanged `.dse` moves into `LegacyCompiled`, and its README.

Installed coverage: failed snapshot I/O checks and pending-record preservation; parent-first FitTo/collision restoration; persistent reference and binding ambiguity guards; explicit bone proxies/legacy review; selective failure containment/current storage ownership checks; durable sidecar paths and retention; icon JSON and emissive recovery validation; selective emissive capture; property guards/owned control Undo labels; busy-finally cleanup; sibling/encoded PDF launcher. These are source changes supported by isolated mocks. Native testing has invalidated the assumption that metadata participates in the property Undo block automatically.

Packaged checks: 379 passed, 0 failed, 2 skipped. They run against actual installed scripts. Five revised sources loaded and passed syntax checks in DAZ4 4.24.0.4 and DAZ6 6.25.2026.14722. Final guide formatting removed trailing whitespace after the initial syntax run; all five final files were subsequently rechecked in DAZ4. This does not establish successful end-to-end operation.

## Native blockers to fix next

1. **Resolved and installed: DAZ4 live node identity.** The alias-safe session identity comparison now covers node relations and node collections in all four engines. Exact candidate helper diagnostics in DAZ4 and DAZ6 recognize live constructor/enumeration aliases and save stable references successfully. Native rig-bone membership and Undo-recreated node identities remain additional coverage checks. Local repair commit: 8d3fc75.
2. **High / confirmed native behavior in both versions: metadata Undo/cancel.** Actual `AddStringDataToNodeEx`/`AddStringDataToNode` helpers (unchanged from baseline) leave a newly created data item/value after native Undo, while the parent rolls back correctly. Updating an existing field from `before` to `during` inside a cancelled operation leaves `during`. Owned holds close correctly; they do not make those metadata writes undoable. Implement explicit before-state compensation for failed operations. Accepted Undo/Redo needs a separately proven mechanism; a public script custom Undo-item constructor was not verified. Do not infer transaction atomicity from the mock Undo model.
3. **Confirmed DAZ4 export error handling blocker:** actual native material export returns a DzError object. Its explicit valueOf() returns 0 for success and 98 for a blocked destination; Number(raw) misleadingly returns 0 for both. The earlier Number(...) recommendation was unsafe and is superseded. Normalize the typed primitive from an explicit valueOf() at the narrow documented API call site, then require code zero and valid output. DAZ6 returns primitive 0/98. The corrected helper is under validation; it is not installed yet.
4. **Queue alias correction installed:** cleanup captures live owners, deduplicates and groups by native session identity, validates all owners before field mutation and removes each empty item once. All 28 alias queue mocks pass. Additional native queue coverage is pending.

The earlier blank-figure FitTo failure was a fixture strict-equality assumption. Focused diagnostics prove blank native figures accept FitTo in both versions. Initial empty-shape material attachment failure likewise does not prove an exporter bug; valid geometry is needed.

Native DAZ4 behavior did verify: absent-shape backup failure publishes no record; physical backup path/readability/missing/empty checks; missing durable backup retains pending fields; sparse single-wrapper metadata cleanup. Full restoration, smoothing-modifier collision, actual material export/apply, emissive behavior/animation, accepted Undo/retry lifecycle, real geografts, OS PDF handler and modal UI are still pending.

Completed WM native runs closed and the two preexisting DAZ processes retain their PID/start-time identities. WM continuation retains exclusive native ownership while further guarded tests run. Scratch fixtures, results and correction drafts are preserved under `C:\Users\Andrii\Documents\Codex\2026-10-01\task\wm-audit\implementation`.

Evidence:

- Original preservation: `original-full-after-install.json` (146 before/after; Changed=0).
- Mock receipt: this repository's ignored `.test-output/results.json`.
- DAZ4 focused diagnostics: `compat/native/wm_audit_30d6ff579d9b46aa9072dfb8bf34d407/results.json`.
- DAZ6 focused diagnostics: `compat/native/wm_audit_38a14f82808c4b6c9ef3e624dc1f9a6b/results.json`.
- Initial behavior receipt: `compat/native/wm_audit_9dcde4cf8c4c419e994340ca15d06a22/results.json`.
- Drafts: `graph/wm2-node-comparison-proposal.dsa`, `graph/node-comparison-replacements.json`, `storage/queue-wrapper-alias-proposal.dsa`.

Safe continuation order: validate/install explicit DzError unboxing; add failure compensation for metadata; prove accepted Undo/Redo strategy; construct valid disposable geometry; rerun native storage and control fixtures on both versions; then finalize the build. Named loadouts/Archmage integration remain optional later work, outside this repair checkpoint.

Continuation evidence (2026-10-01):

- Alias native DAZ4: compat/native/wm_audit_66a65c2274cc46d78257465b2cfa1966/results.json.
- Alias native DAZ6: compat/native/wm_audit_b3fe8a1429b843e69bcee26fa9e72bd7/results.json.
- Property/DzError native capabilities: DAZ4 wm_audit_f4603361e1e34b3faddb377ddb846776; DAZ6 wm_audit_53bf4e4c347f400ba0363a47e7f56e49. Both support native property value Undo/Redo/cancel; new property attachment is physically removed by Undo/cancel. The legacy tests expecting the attached property after rollback were overly strict: untouched legacy fallback on property absence preserves logical recovery. No new metadata adapter is installed yet.
- Actual installed native DAZ6 snapshot save/material/default-UV restore and hidden-property scene persistence: compat/native/wm_audit_c44d55bd80b844048eb7f2b58ee5b447/results.json. These are disposable triangle checks; alternate UVs, real graft content, modal UI and OS PDF launch remain unverified. Literal Unicode in that fixture was already substituted before export, so this run does not prove Unicode preservation.
