# Documents

> 🕒 Brief posted on Friday 2026/10/23 14:40
>
> 🕒 Brief settled on Friday 2026/10/23 14:52

Documents may be sheet music, chord grids, or playable files in many formats.

## Use cases

I wrote a sheet music score in MuseScore:

- I want to share it as it is with everyone: I upload it with the title "Complete score", no instrument.
- I also exported the horns' part to PDF: I upload it with the title "Horns" and link the instruments "trumpet" and "trombone".

At rehearsal, I wrote a chord grid on a loose sheet of paper. I take a picture with my phone and import it into the app, with the title "Chords".

## Document properties

- Title (user defined)
- Type (from the file type), with a matching icon
- Instruments: an optional list of related instruments
- Who added it, and when ("Added by Lea, 23 Oct")

## Accepted formats

The exhaustive list: photos (JPEG, PNG, WebP), PDF, Guitar Pro files (`.gp`, `.gp5`, `.gpx`...), MuseScore files (`.mscz`, `.mscx`). No vector images: SVG can carry scripts, and a PDF covers that need.

- **4 MB at most, for every document**, photos included.
- **Photos are shrunk in the browser before upload**, as hard as reading allows: the online storage budget comes first. iPhone photos (HEIC) are converted on the way.
- The type is checked from the file's first bytes and its extension together, never from what the browser says.
- Photos and PDFs open in the app; Guitar Pro and MuseScore files are downloaded, for the phone's own app.

## Offline

Photos and PDFs are saved on the device for offline use, like band logos, within a storage budget: rehearsals often have no network. Guitar Pro and MuseScore files are online only.

## Limits

At most 20 documents per song, and a storage budget per band during the beta (500 MB), so a mistake can't fill the bucket.

## GUI

"Documents" is a new block on the song page, just after "Links" (before "Notes"). The song page's blocks, in order: Details, Lyrics, Links, Documents, all accordions, only Links open at first; then Notes, at the end, a simple card as today.

- A button adds a document: pick a file (on a phone, the camera or the gallery), its title and instruments; a progress bar while it uploads.
- Any member edits a document's title and instruments. Its file is never replaced: to change it, delete the document and add it again.
- A document is deleted by the member who added it or by the band leader.

## Behind the scenes

- Files are served by the API to the band's members only, like logos.
- Adding, editing and removing a document record their events; the journal says it ("Lea added a document to Zombie").
- A deleted song deletes its documents' files from storage.

## Issues

- [#241 Documents Epic](https://github.com/TitoVince35/coverband/issues/241)
- [#238 Documents: the files, their types and the API](https://github.com/TitoVince35/coverband/issues/238)
- [#239 Documents: the song page block, adding with a progress bar](https://github.com/TitoVince35/coverband/issues/239)
- [#240 Documents offline: photos and PDFs on the device](https://github.com/TitoVince35/coverband/issues/240)
