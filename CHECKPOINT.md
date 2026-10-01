# Safe checkpoint — repair build is not release-ready

Scope: all installed changes are confined to `D:\Tests\DAZ Test Folder\Scripts\matew\Wearables Manager 2`. The original sibling `Wearables Manager` was read only: all 146 files have unchanged names, lengths and SHA-256 hashes after installation. No existing DAZ scene/process, toolbar, credentials, security setting, Git global setting or remote repository was changed. Remote creation remains deferred.

Local commits:

- Baseline: `1d15974476ccecaa30f8fe690a9bee6e991194bc`.
- Repair: `c686a279e2f0dfa70c0a9ab071c915b4897dcb21` — five `.dsa` changes, four unchanged `.dse` moves into `LegacyCompiled`, and its README.

Installed coverage: failed snapshot I/O checks and pending-record preservation; parent-first FitTo/collision restoration; persistent reference and binding ambiguity guards; explicit bone proxies/legacy review; selective failure containment/current storage ownership checks; durable sidecar paths and retention; icon JSON and emissive recovery validation; selective emissive capture; property guards/owned control Undo labels; busy-finally cleanup; sibling/encoded PDF launcher. These are source changes supported by isolated mocks. Native testing has invalidated the assumption that metadata participates in the property Undo block automatically.

Packaged checks: 287 passed, 0 failed, 2 skipped. They run against actual installed scripts. Five revised sources loaded and passed syntax checks in DAZ4 4.24.0.4 and DAZ6 6.25.2026.14722. Final guide formatting removed trailing whitespace after the initial syntax run; all five final files were subsequently rechecked in DAZ4. This does not establish successful end-to-end operation.

## Native blockers to fix next

1. **High / confirmed DAZ4 candidate regression: live node identity.** `WM2SceneContains` uses strict wrapper equality. A newly constructed node successfully enters the scene, keeps the same `elementID` and metadata marker through enumeration, and compares loosely equal; strict equality is false in DAZ4. Consequently the actual reference-saving helper rejects the live target. DAZ6 comparisons are stable. Use a native/session identity comparison and a separate live check; apply it to node collections and all node-only comparisons. The graph correction is drafted, not installed.
2. **High / confirmed native behavior in both versions: metadata Undo/cancel.** Actual `AddStringDataToNodeEx`/`AddStringDataToNode` helpers (unchanged from baseline) leave a newly created data item/value after native Undo, while the parent rolls back correctly. Updating an existing field from `before` to `during` inside a cancelled operation leaves `during`. Owned holds close correctly; they do not make those metadata writes undoable. Implement explicit before-state compensation for failed operations. Accepted Undo/Redo needs a separately proven mechanism; a public script custom Undo-item constructor was not verified. Do not infer transaction atomicity from the mock Undo model.
3. **DAZ4 compatibility risk requiring the actual exporter check:** native `DzError` values from tested attachment methods are objects coercing to numeric zero, whereas DAZ6 returns numbers. Normalize product save-result checks with `Number(...)`; the candidate's strict numeric test can reject a DAZ4 success. Actual material export remains untested because the geometry fixture lacks a facet mesh. No successful native snapshot export is claimed.
4. **Potential native wrapper-alias cleanup risk:** a data item obtained through separate native wrappers can defeat `indexOf` grouping. Owner-based queue deduplication is drafted and passes 28 alias mocks; installation/native validation is pending.

The earlier blank-figure FitTo failure was a fixture strict-equality assumption. Focused diagnostics prove blank native figures accept FitTo in both versions. Initial empty-shape material attachment failure likewise does not prove an exporter bug; valid geometry is needed.

Native DAZ4 behavior did verify: absent-shape backup failure publishes no record; physical backup path/readability/missing/empty checks; missing durable backup retains pending fields; sparse single-wrapper metadata cleanup. Full restoration, smoothing-modifier collision, actual material export/apply, emissive behavior/animation, accepted Undo/retry lifecycle, real geografts, OS PDF handler and modal UI are still pending.

All owned WM native processes closed. Only the two preexisting DAZ processes remain, with unchanged PID/start-time identities. Native ownership is released. Scratch fixtures, results and correction drafts are preserved under `C:\Users\Andrii\Documents\Codex\2026-10-01\task\wm-audit\implementation`.

Evidence:

- Original preservation: `original-full-after-install.json` (146 before/after; Changed=0).
- Mock receipt: this repository's ignored `.test-output/results.json`.
- DAZ4 focused diagnostics: `compat/native/wm_audit_30d6ff579d9b46aa9072dfb8bf34d407/results.json`.
- DAZ6 focused diagnostics: `compat/native/wm_audit_38a14f82808c4b6c9ef3e624dc1f9a6b/results.json`.
- Initial behavior receipt: `compat/native/wm_audit_9dcde4cf8c4c419e994340ca15d06a22/results.json`.
- Drafts: `graph/wm2-node-comparison-proposal.dsa`, `graph/node-comparison-replacements.json`, `storage/queue-wrapper-alias-proposal.dsa`.

Safe continuation order: apply/test DAZ4 node comparisons and normalized error codes; add failure compensation for metadata; prove accepted Undo/Redo strategy; construct valid disposable geometry; rerun native storage and control fixtures on both versions; then finalize the build. Named loadouts/Archmage integration remain optional later work, outside this repair checkpoint.
