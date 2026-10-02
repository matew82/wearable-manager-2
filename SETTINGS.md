# Wearables Manager 2 settings

Open **Wearables Manager Icon Rules** or **Wearables Manager Supported Figures** from the same Scripts folder as WM2. The Full and Menu dialogs also have settings buttons. The separate figure editor can register a custom figure before WM2 recognizes it.

## Icon rules

Select a scene item and use **Use Selected Name** or **Use Selected Label**, choose its PNG icon, then Add/Update. Save also applies a changed rule form. Cancel discards the draft.

The four rule types compare text literally and are case-sensitive:

- Exact internal name.
- Exact label, ignoring only a final numbered copy suffix such as `Hair (1)` or `Hair (2)`.
- Word in internal name.
- Word in label.

A word pattern must have an allowed boundary on **both sides**: the start/end of the text, whitespace, a digit `0`–`9`, a hyphen/dash (`-` or Unicode U+2010–U+2015), underscore, or `!`. For example, `Duvet` matches `dForce Duvet`, `Duvet2`, `Duvet_cover` and `!Duvet!`; it does not match `DuvetCover` or `CoverDuvet`. Patterns are literal text, including punctuation; regex characters have no special meaning. Word rules use the original name/label and do not strip copy suffixes.

An exact name wins before an exact label, followed by word rules and then legacy prefixes. The longest matching word pattern wins; equal lengths favor a label rule, then the earlier row. Move Up/Down changes the final row-order tie. Preview Scene uses the same matcher as Full/Menu and shows rule matches for up to 2,000 scene items without changing nodes.

Previously saved name/label prefix rules keep their original matching behavior and are marked **Legacy** in the list and preview. Among legacy prefixes, longer patterns still win, then label before name, then the earlier row. They are not converted into word rules because this would change their meaning. You can move or remove a legacy row; its form is read-only. Use **New Rule** to create a replacement with one of the four current modes. New Rule first commits a valid pending form, and retains an invalid draft for correction. Existing legacy rows are preserved when settings are saved.

Choose an existing PNG in Resources. A missing or unreadable configured icon uses WM2's existing automatic icon choice. Existing automatic mappings remain available.

## Supported figures

The list starts with the fourteen shipped Genesis internal names. Select a custom independent figure or one of its bones and choose **Add Selected Figure**. A bone resolves to its owning figure. Fitted wearables, props, groups and figures attached under another skeleton cannot be registered as independent owners.

Entries use exact internal names, so changing a label does not change recognition. Remove edits the draft registry. **Reset Genesis Defaults** adds missing Genesis entries while retaining custom entries.

Changes apply on the next WM2 run. An open transfer dialog retains its current figure registry. Re-add a removed figure type before restoring its stored wearables.

Existing Genesis attachment exemptions remain in place. Custom figures use conservative graft protection; unknown graft relations are preserved. Registering a figure does not infer its body-part names or material layout.

## Saving settings

Save creates or updates `Resources/WM2 Settings.json`. It does not overwrite `Resources/Wearables Manager.json`. If another editor changed the settings, reload before saving. A newer settings schema is read-only. Repairing an invalid settings file retains its original backup and reports the backup path.

## Validation status

These settings changes have source tests and isolated mocks. Native DAZ4/DAZ6 dialog layout, PNG loading and filesystem behavior remain for user runtime verification; these checks do not launch DAZ. The earlier transfer hotfix remains included. The broader metadata/emissive repair candidate is separate and has not been installed with these settings features.
