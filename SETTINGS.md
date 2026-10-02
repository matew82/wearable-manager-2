# Wearables Manager 2 settings

Open **Wearables Manager Icon Rules** or **Wearables Manager Supported Figures** from the same Scripts folder as WM2. Full has both settings buttons; Menu retains **Icon Rules...**. Use the separate figure editor to manage recognition and child protection before opening Menu.

## Icon rules

When exactly one scene object is selected, Pattern starts with its label in **Exact label** mode. With no selection or several selections, the form stays blank and a notice explains how to use the selection. Manual rules remain available. **Use Selected Name/Label** copies text into Pattern while keeping the chosen Match mode. Choose Match separately. Each button requires one eligible object and is disabled when the pattern already equals that value, ignoring case. These buttons refresh when the pattern or scene selection changes. Bones are not selected-item icon targets; fitted clothing and props remain eligible.

Choose a PNG from the icon list, or **Browse PNG**. The file picker starts in this WM2 installation's `Resources` icons directory. An external PNG is copied into that directory under its original basename. If a different file already uses that name, you must choose another filename or cancel; existing files are never overwritten. Selecting the same canonical file already in Resources reuses it without copying. Failed/cancelled imports keep the current icon choice. Imported files stay available in Resources even if you later cancel the settings draft.

**Clear Draft** deselects the rule and clears the form without adding it. **Add Rule** adds the form as a new row in the draft list; **Update Rule** replaces the selected row. **Save** writes the draft list and also commits a changed valid form. **Cancel** discards settings edits. Clear Draft is useful for abandoning an invalid form or starting a new rule while viewing a legacy row.

All four modes compare literal text **ignoring case**, while retaining the spelling you enter:

- Exact internal name.
- Exact label, ignoring only a final numbered copy suffix such as `Hair (1)` or `Hair (2)`.
- Word in internal name.
- Word in label.

A word pattern must have an allowed boundary on **both sides**: start/end, whitespace, a digit `0`-`9`, a hyphen/dash (`-` or Unicode U+2010-U+2015), underscore, or `!`. `Duvet` matches `dForce Duvet`, `Duvet2`, `Duvet_cover` and `!Duvet!`, including case variants. It does not match `DuvetCover` or `CoverDuvet`. Regex characters have no special meaning. Word rules use the original label/name without removing copy suffixes.

Exact name wins before exact label, then word rules, then legacy prefixes. Longer word patterns win; equal lengths favor label, then the earlier row. Move Up/Down changes the final row-order tie. The editor rejects a new rule of the same kind and pattern, ignoring case; update the existing row instead. Older saved rows differing only by case remain intact, with a validation notice explaining that the earlier matching row wins. Supported-figure names keep their separate exact case-sensitive policy.

Previously saved prefix rules remain marked **Legacy**, with their original prefix boundaries and longest/label/earlier-row ordering. Their icon matching now also ignores case. Their forms remain read-only; you can move or remove them. Use Clear Draft to create an exact or word replacement. Saving retains untouched legacy rows.

The lower results area is an icon-rule preview, not a second saved-rule list. It initially shows the selected item, or a bounded scene sample. **Preview Scene** checks up to 2,000 scene nodes using the same matcher as Full/Menu. Each row shows internal name, label, and the winning icon/rule, or the automatic-icon fallback. A valid current form is included as an unsaved candidate; it does not change any scene node or save settings. No matches, an empty scene, an invalid draft, and enumeration errors each produce an explicit result. DAZ indexed host collections are read without requiring native JavaScript Array branding. Preview covers scene nodes; it does not restrict itself to main figure owners or the current Menu transfer list.

A missing or unreadable configured PNG uses WM2's existing automatic icon choice. Native layout and rendering remain for user verification; source/mock tests do not launch DAZ.

## Supported figures

Fresh settings start with ten known Genesis internal names, through Genesis9. The four additional compatibility names in the supplied scripts (Genesis9_1 and Genesis10 variants) are no longer fresh defaults. Existing saved names remain intact. Select a custom independent figure or one of its bones and choose **Add Selected Figure**. A bone resolves to its owning figure. The editor shows **Internal name** separately from **Visible label**. Fitted wearables, props, groups and figures attached under another skeleton cannot be registered as independent owners.

Entries use exact internal names, so changing a label does not change recognition. Remove edits the draft registry. **Reset Genesis Defaults** adds missing Genesis entries while retaining custom entries.

When Menu cannot resolve a supported owner from the selected object, it offers the figure editor before opening its transfer dialog. Opening setup does not register or move anything: choose an eligible independent figure or bone, use **Add Selected Figure**, review child protection, then **Save**. A prop or group can reach setup but cannot itself be registered. Full, Take Off and Put On offer setup for an unsupported selected independent figure or bone. With no selection, select a figure first or use the separate editor.

After Save, WM2 reloads settings, checks for an active process, reads the current selection again, resolves its supported owner and checks for nested figures. If the selection is still unsupported, the transfer dialog stays closed. Cancel returns without opening it. An open Full transfer dialog retains its current figure registry, while saved protection applies immediately. Re-add a removed figure type before restoring its stored wearables.

Select a registry entry and open **Protected Children...** to edit excluded child names. The five existing Genesis attachment profiles are supplied by default. Exact internal names match within that figure's descendants, including same-name copies. Protection includes the child's subtree and any ancestor that would carry it into storage. Full, Menu, Take Off and Put On's removal path check again immediately before parenting or FitTo changes. Alt and transfer marks do not override protection. Already-stored items remain eligible for restoration.

Custom registration initially protects all currently attached nonbone child names, including clothing and props. Review the profile and **Remove Protection** for items you explicitly want to move. Automatic custom-graft safety still applies; unknown graft relations stay protected. Registration uses actual attachments rather than guessing anatomy or material layouts. Review newly added attachments as needed.

Reopen WM2 after changing child protection to refresh its item lists. If nothing is eligible to move, a notice explains the protection/transfer-mark settings; WM2 creates no storage group or snapshot.

**Protect Name** adds the entered name to the child draft. **Use Selected Child** copies a selected attached child's internal name and shows its label. Child **Save** also applies a pending nonempty name, then returns the edited profile to the parent draft. Child **Cancel** discards child edits. Parent Save writes settings; parent Cancel discards the whole draft. **Restore Genesis Protection** adds missing child defaults while retaining custom protection.

## Saving settings

Save creates or updates `Resources/WM2 Settings.json`. It does not overwrite `Resources/Wearables Manager.json`. If another editor changed the settings, reload before saving. A newer settings schema is read-only. Repairing an invalid settings file retains its original backup and reports the backup path.

## Validation status

Schema 2 adds bounded protected-child profiles. Schema 1 migrates in memory while preserving every saved figure name and icon rule; the file changes only on an explicit Save. Installation does not rewrite user settings.

These settings changes have source tests and isolated mocks. Native DAZ4/DAZ6 dialog layout, PNG loading and filesystem behavior remain for user runtime verification; these checks do not launch DAZ. The earlier transfer hotfix remains included. The broader metadata/emissive repair candidate is separate and has not been installed with these settings features.
