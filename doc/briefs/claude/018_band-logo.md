# 018 - Band logo: review and proposal

> 🕒 Study posted on Tuesday 2026/10/20 20:53

Review of [018_band_logo](../vince/018_band_logo.md).

## Review

1. **Avatars already have the whole chain:** an upload prepared in the browser, the real format checked from the file's first bytes, object storage (Garage locally, Scaleway Object Storage in production), and an image route for members only, cached for a year because each new file gets a new key. A logo follows the same model, with four differences.
2. **No square crop.** A logo keeps its shape (round, square or horizontal): every place fits it inside its frame, never crops it.
3. **Resolution for print.** A logo 6 to 8 cm wide at 300 dpi needs 700 to 1,000 px on its longest side. Avatars stop at 512 px and 95 KB.
4. **Transparency.** Logos are often PNGs with a transparent background. WebP keeps it, but Safari can't encode WebP from a canvas, and JPEG has none: PNG must be accepted too. The app is dark by default, so a black logo on a transparent background disappears.
5. **SVG** would be ideal for print, but an uploaded SVG can carry scripts, and serving it from our domain is a security risk. Images only for now.
6. **Offline:** nothing from `/api` goes through the service worker (per-user data that would survive a logout), so a logo is not available offline by itself. Offline data is the app's (#165).

## Decisions (Vince)

- The logo is uploaded from the **band leader's edit dialog** (where the genre is changed), not the lineup page.
- The band leader chooses a **light or dark background** for the logo.
- **No logo: the band's initials.**
- Changing the logo is a **"logo changed" event** in the band's journal.
- **Offline too:** the logo is available offline like the rest of the band.
- **No print layout yet:** it comes with setlists; this brief stores the logo in print quality and displays it.

## Proposal

### Storage and API

- `bands` gets the logo's key, its thumbnail's key and its background (`light` / `dark`): columns added only, safe while the previous release still serves.
- Files in object storage under `bands/<id>/logo/<uuid>`: the logo, up to 2,000 px on its longest side (about 2 MB at most), and a 256 px thumbnail for the band list.
- Upload, background change and removal: band leader only; non-members get a 404. The format is checked from the first bytes: PNG, WebP or JPEG. The previous files are deleted once the band points to the new ones.
- Two image routes (logo and thumbnail), members only, cached for a year (`private, immutable`) since each file has its own key.
- The "logo changed" event (added, replaced or removed) in the journal, in both languages.

### Upload

- In the band leader's edit dialog: choose a file, preview it on its background, choose light (default) or dark, replace or remove.
- The browser fits the image within 2,000 px without cropping or upscaling, keeps transparency (PNG or WebP), and makes the thumbnail.
- Errors and labels in both languages.

### Display

- `BandLogo`: the logo fitted inside its frame on the chosen background; the band's initials when there is no logo ("SP" for "The Socks Pistils").
- Large on the band's home page, as a thumbnail in the band list.

### Offline

- While online, `keepBandOffline` also downloads each band's logo and saves it in the app's IndexedDB database, keyed by the logo's key: a replaced logo replaces the saved one, a removed one is deleted.
- Only the full logo is saved: offline, the band list shows it scaled down.
- Emptied with the rest of the user's data (logout, another account), dropped after 30 days.
- `BandLogo` shows the server's image online, the saved copy offline, the initials when neither is there.
- Built on the offline code fixed by #174, which comes first.

### Tests

- Unit: the format check, the fit without cropping, the initials.
- API: band leader only, 404 for non-members, the journal event.
- End to end: the band leader uploads a logo, it shows on the band page and in the list; offline, it still shows; removed, the initials come back.

## Plan

An Epic with four issues:

1. Storage and API.
2. Upload from the band's edit dialog.
3. Display: `BandLogo` with initials, the band page and the band list, the end-to-end test.
4. Offline: the logo saved in IndexedDB, the offline part of the end-to-end test.

2 and 3 need 1; 4 needs 3 and #174.
