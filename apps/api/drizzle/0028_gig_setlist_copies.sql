-- Each gig its own setlist (#358): every gig linked to a setlist gets a copy of it (its parts and
-- songs, archived if the original is), titled after the gig as the API does (`gigSetlistTitle`:
-- its title, else its venue's name, then its date; numbered when taken), and linked to it. The
-- originals stay as they are, as templates. Only adds rows, then an index: the release still
-- serving while this runs keeps working.
DO $$
DECLARE
  g record;
  base text;
  candidate text;
  n integer;
  copy_id uuid;
  part record;
  new_part uuid;
BEGIN
  FOR g IN
    SELECT gigs.id, gigs.band_id, gigs.date, gigs.setlist_id,
      coalesce(gigs.title, venues.name) AS name,
      setlists.created_by_id, setlists.archived_at
    FROM gigs
    JOIN setlists ON setlists.id = gigs.setlist_id
    LEFT JOIN venues ON venues.id = gigs.venue_id
    ORDER BY gigs.date, gigs.created_at, gigs.id
  LOOP
    -- 100 characters at most: the name cut so " · YYYY-MM-DD" and a number (" 99") fit.
    base := rtrim(left(g.name, 100 - 13 - 3)) || ' · ' || to_char(g.date, 'YYYY-MM-DD');
    candidate := base;
    n := 1;
    WHILE EXISTS (
      SELECT 1 FROM setlists WHERE band_id = g.band_id AND lower(title) = lower(candidate)
    ) LOOP
      n := n + 1;
      candidate := rtrim(left(base, 100 - length(' ' || n))) || ' ' || n;
    END LOOP;

    INSERT INTO setlists (band_id, title, created_by_id, archived_at)
    VALUES (g.band_id, candidate, g.created_by_id, g.archived_at)
    RETURNING id INTO copy_id;

    FOR part IN
      SELECT id, position, name FROM setlist_parts WHERE setlist_id = g.setlist_id ORDER BY position
    LOOP
      INSERT INTO setlist_parts (band_id, setlist_id, position, name)
      VALUES (g.band_id, copy_id, part.position, part.name)
      RETURNING id INTO new_part;
      INSERT INTO setlist_songs (band_id, setlist_id, part_id, position, song_id)
      SELECT g.band_id, copy_id, new_part, position, song_id
      FROM setlist_songs WHERE part_id = part.id;
    END LOOP;

    UPDATE gigs SET setlist_id = copy_id WHERE id = g.id;
  END LOOP;
END $$;--> statement-breakpoint
DROP INDEX "gigs_setlist_id_index";--> statement-breakpoint
CREATE UNIQUE INDEX "gigs_setlist_unique" ON "gigs" USING btree ("setlist_id");
