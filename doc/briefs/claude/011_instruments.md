# 011 - Instruments: review and proposal

> 🕒 Study posted on Sunday 2026/10/18 15:58

Review of [010_instruments](../vince/010_instruments.md).

## Review

1. **Today's data doesn't fit a tag yet.** `band_members.instrument` is one free-text value per membership. A tag needs a stable identity: a **code** per known instrument (`guitar`, `bass_guitar`, `vocals`…), translated and given an icon only when displayed, with free text only for the rest. Existing values are migrated to codes where they match.
2. **Free text creates duplicates unless it's matched.** « guitare », « Basse », "bass": typing is matched against the labels in both languages plus a few synonyms (« chant », « batterie », « clavier », "keys"), ignoring case and accents, and saved as the code. Only what matches nothing stays free text.
3. **One building block, reused everywhere:** the instruments list in `@coverband/shared`, labels in the web app's locale files, one `InstrumentPicker` and one `InstrumentIcon`. Sheet music and media (tunes epic) will reuse them rather than invent their own tags.
4. **The list, for cover bands:** flute, clarinet and harmonica were missing.
5. **Icons:** Lucide has guitar, electric guitar, drum, piano, keyboard and microphone, plus a music note for the default. Nothing for strings, brass or woodwinds; other free sets (game-icons.net) have them in another style and require attribution.

## Decisions (Vince)

- **Several instruments per membership**, so per band: a musician may play bass in one band and guitar plus vocals in another.
- **Custom instruments are shared by all bands.** Safeguard: a custom label is only suggested to other bands once two bands use it, so a typo or something personal doesn't reach everyone's suggestions.
- **List:** the brief's 19 plus flute, clarinet and harmonica (22). Vocals stay one instrument (no lead / backing split).
- **Icons:** Lucide where it has one, the others drawn in Lucide's style (24 px, 2 px stroke, `currentColor`); a music note for free text.
- **Picker, kept simple:** no family grouping. A combobox: opening it lists every instrument with its icon; typing filters the list (both languages, synonyms); text that matches nothing can be kept as a custom instrument with the default icon.
- **Onboarding:** one optional field, "Main instrument" (required today).
- **Where musicians edit them:** instruments are per band, so on the **lineup page**, not the profile: an edit button on your own row opens a dialog with your instruments in this band (add with the picker, remove with ✕). Each musician edits only their own for now.
- **Scope:** musicians only for now, with reusable pieces ready for the tunes epic.

## Plan

An epic with four issues:

1. **Instruments catalogue and icons:** `INSTRUMENTS` (22 codes) in `@coverband/shared`, labels and synonyms in both locales, the matching function, `InstrumentIcon` with the drawn icons.
2. **Instruments per band membership:** a list per membership (codes or free text) replacing the text column, migration of existing values, API to read and update your own list, shared custom suggestions (used by two bands or more), activity.
3. **Instrument picker, and "Main instrument" in onboarding:** the reusable combobox; the wizard's optional field.
4. **Instruments in the lineup:** shown with icons; editing your own instruments from your row.
