# 021 - Enhancements brief: challenge and decisions

> 🕒 Study posted on Friday 2026/10/23 11:39

Review of [021_enhancements](../vince/021_enhancements.md): the questions raised, and what Vince decided.

## Repertoire

- **Sort:** title or energy only, as now: just add a direction (my suggestion of more sort keys declined).
- **Details in the list:** tempo, duration and key in the main text colour, bold like the title; the artist stays muted. "White" means the theme's foreground, so it reads in light mode too.

## Creating and editing a song

- **No Deezer link** when creating a song: Deezer's duration and genre are still saved, only the link was noise.
- **"Search again" on an edited song: dropped.** The risks raised: overwriting what the band typed, duplicate links, the shared daily quota; and Deezer gives no key, so only the duration could have been refreshed.

## Links

- **"Search on Deezer" in the link form**, Deezer only (free, no quota; my suggestion of YouTube too declined), like the lyrics search: matches listed, one chosen.
- **The link's title is the found track's title** (it says "Live", "Remastered"...), not the song's, which the page already shows.

## Band pages

- **No logo:** not the app's logo, which would look like the band's. The band leader sees an empty logo area linking to the band settings ("Add your band's logo"); musicians see nothing.
- **No welcome message:** the page opens on the logo, then the journal; the band name is in the header.
- **Band settings page** (genre, logo), for the band leader only, shown disabled to musicians. Named "band settings" from the start: member settings per band will come, on a page of their own. It replaces the header's edit button, so it comes first.
- **Band switcher:** unchanged.

## Menu

Vince's brief asked for a left column, fixed on large screens, behind a burger on phones. A burger hides the navigation the app is used for most, and a bottom bar is the phone standard for up to five sections. Decided:

- the tabs stay on large screens, a bottom bar on phones, both with an icon and a label (five items fit a 360 px phone with labels; icons alone would be guesswork);
- the band settings open from the band switcher's menu, not a tab (with setlists and gigs, a sixth item wouldn't fit);
- a sixth section would make the last item "More", and a left column on large screens could be considered then;
- on a phone: clear of the home indicator (safe area), room left at the bottom of the page, hidden while the keyboard is open.
