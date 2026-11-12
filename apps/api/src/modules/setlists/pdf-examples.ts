import type { Language, MusicalKey } from "@coverband/shared";
import type { ExportSource } from "./export-document";

/**
 * Setlists that show how the PDF handles its edge cases (#299), from fixed data: drawn by
 * `bun run setlist:examples` into doc/setlist-exports/, and checked by the layout's tests.
 */
export type PdfExample = {
  /** The file's name, without extension. */
  name: string;
  /** What it shows, for the page describing the examples. */
  shows: string;
  language: Language;
  logo: "wide" | "tall" | "square" | null;
  source: Omit<ExportSource, "band" | "updatedAt">;
};

const TITLES = [
  ["Sweet Child O' Mine", "Guns N' Roses"],
  ["Africa", "Toto"],
  ["Linger", "The Cranberries"],
  ["Black Hole Sun", "Soundgarden"],
  ["Don't Stop Me Now", "Queen"],
  ["Highway to Hell", "AC/DC"],
  ["Seven Nation Army", "The White Stripes"],
  ["Smells Like Teen Spirit", "Nirvana"],
  ["Purple Rain", "Prince"],
  ["Superstition", "Stevie Wonder"],
  ["Wonderwall", "Oasis"],
  ["Zombie", "The Cranberries"],
  ["Hotel California", "Eagles"],
  ["Back in Black", "AC/DC"],
  ["Use Somebody", "Kings of Leon"],
  ["Mr. Brightside", "The Killers"],
  ["Valerie", "Amy Winehouse"],
  ["I Will Survive", "Gloria Gaynor"],
  ["Le Sud", "Nino Ferrer"],
  ["Les Champs-Élysées", "Joe Dassin"],
  ["Should I Stay or Should I Go", "The Clash"],
  ["Billie Jean", "Michael Jackson"],
  ["Roxanne", "The Police"],
  ["Dancing Queen", "ABBA"],
  ["Livin' on a Prayer", "Bon Jovi"],
] as const;

const KEYS: MusicalKey[] = ["Em", "D", "A", "C", "G", "Bm", "F#m", "E"];

/** `count` songs from the list, starting at `from`, with varied energy, keys and durations. */
function songs(count: number, from = 0) {
  return Array.from({ length: count }, (_, i) => {
    const [title, artist] = TITLES[(from + i) % TITLES.length] ?? ["", ""];
    return {
      title,
      artist,
      standardDuration: 170 + (((from + i) * 37) % 140),
      ownDuration: null,
      energy: (from + i) % 4 || null,
      key: KEYS[(from + i) % KEYS.length] ?? null,
      bandKey: null,
    };
  });
}

export const PDF_EXAMPLES: PdfExample[] = [
  {
    name: "01-short",
    shows: "One short part: one column, full size, one page. A wide logo.",
    language: "en",
    logo: "wide",
    source: { title: "Friday at the pub", parts: [{ name: null, songs: songs(9) }] },
  },
  {
    name: "02-long-first-set",
    shows:
      "A long first set on two columns (each song's details on a second line); the next two sets share the second page, on one column.",
    language: "en",
    logo: "square",
    source: {
      title: "Wedding at the castle",
      parts: [
        { name: "Set 1", songs: songs(24) },
        { name: "Set 2", songs: songs(12, 5) },
        { name: "Encore", songs: songs(4, 11) },
      ],
    },
  },
  {
    name: "03-two-columns-same-page",
    shows:
      "The second part would not fit what's left of the first page on one column: on two columns, it stays on that page.",
    language: "en",
    logo: null,
    source: {
      title: "Rehearsal",
      parts: [
        { name: "Warm-up", songs: songs(10) },
        { name: "New songs", songs: songs(12, 10) },
      ],
    },
  },
  {
    name: "04-five-parts",
    shows: "Five parts (the most a setlist has): each whole, several to a page.",
    language: "fr",
    logo: "wide",
    source: {
      title: "Festival, toute la journée",
      parts: [
        { name: "Midi", songs: songs(8) },
        { name: "Après-midi", songs: songs(10, 8) },
        { name: "Apéro", songs: songs(9, 3) },
        { name: "Soirée", songs: songs(12, 12) },
        { name: "Rappels", songs: songs(3, 20) },
      ],
    },
  },
  {
    name: "05-fifty-songs",
    shows:
      "One part of 50 songs (the most a setlist has): it only fits on one page with everything smaller, the last resort.",
    language: "en",
    logo: "tall",
    source: { title: "The whole repertoire", parts: [{ name: "Everything", songs: songs(50) }] },
  },
  {
    name: "06-long-texts-missing-details",
    shows:
      "Long titles and artists, cut with “…”; songs without a duration (the totals say how many), key or energy; no logo.",
    language: "en",
    logo: null,
    source: {
      title:
        "A very long setlist title for the annual charity gala dinner and dance at the town hall",
      parts: [
        {
          name: "A part with a long name, to see where it stops before its duration",
          songs: [
            {
              title: "(Sittin' On) The Dock of the Bay, extended version with the horn section",
              artist: "Otis Redding and the whole Stax house band, with Booker T. & the M.G.'s",
              standardDuration: null,
              ownDuration: null,
              energy: 3,
              key: "G",
              bandKey: null,
            },
            {
              title: "Untitled",
              artist: "Nobody",
              standardDuration: null,
              ownDuration: null,
              energy: null,
              key: null,
              bandKey: null,
            },
            ...songs(6, 2),
          ],
        },
        { name: "An empty part", songs: [] },
      ],
    },
  },
  {
    name: "07-french-other-scripts",
    shows:
      "In French: accents, and titles in other scripts (Greek, Cyrillic) written by the bundled font; the band's own key and duration. A tall logo.",
    language: "fr",
    logo: "tall",
    source: {
      title: "Soirée du monde",
      parts: [
        {
          name: "Partie unique",
          songs: [
            {
              title: "Μισιρλού",
              artist: "Dick Dale",
              standardDuration: 135,
              ownDuration: 150,
              energy: 3,
              key: "E",
              bandKey: "D",
            },
            {
              title: "Группа крови",
              artist: "Кино",
              standardDuration: 286,
              ownDuration: null,
              energy: 2,
              key: "Am",
              bandKey: null,
            },
            {
              title: "Ça plane pour moi",
              artist: "Plastic Bertrand",
              standardDuration: 180,
              ownDuration: null,
              energy: 3,
              key: "C",
              bandKey: null,
            },
            ...songs(5, 18),
          ],
        },
      ],
    },
  },
];
