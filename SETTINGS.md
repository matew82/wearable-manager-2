# Wearables Manager 2 settings

Open **Wearables Manager Icon Rules** or **Wearables Manager Supported Figures** from the same Scripts folder as WM2. The Full and Menu dialogs also have settings buttons. The separate figure editor can register a custom figure before WM2 recognizes it.

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

The list starts with the fourteen shipped Genesis internal names. Select a custom independent figure or one of its bones and choose **Add Selected Figure**. A bone resolves to its owning figure. Fitted wearables, props, groups and figures attached under another skeleton cannot be registered as independent owners.

Entries use exact internal names, so changing a label does not change recognition. Remove edits the draft registry. **Reset Genesis Defaults** adds missing Genesis entries while retaining custom entries.

Changes apply on the next WM2 run. An open transfer dialog retains its current figure registry. Re-add a removed figure type before restoring its stored wearables.

Existing Genesis attachment exemptions remain in place. Custom figures use conservative graft protection; unknown graft relations are preserved. Registering a figure does not infer its body-part names or material layout.

## Saving settings

Save creates or updates `Resources/WM2 Settings.json`. It does not overwrite `Resources/Wearables Manager.json`. If another editor changed the settings, reload before saving. A newer settings schema is read-only. Repairing an invalid settings file retains its original backup and reports the backup path.

## Validation status

These settings changes have source tests and isolated mocks. Native DAZ4/DAZ6 dialog layout, PNG loading and filesystem behavior remain for user runtime verification; these checks do not launch DAZ. The earlier transfer hotfix remains included. The broader metadata/emissive repair candidate is separate and has not been installed with these settings features.
