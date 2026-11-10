# The Setlists

> 🕒 Brief posted on Tuesday 2026/11/10 23:06
>
> 🕒 Brief settled on Tuesday 2026/11/10 23:33

## Entity

A setlist is an ordered list of songs from a band's repertoire.
It may be split into several parts, e.g. first set, second set, encore.

A setlist is identified by its title: unique within the band (case ignored). Unlike a band name, it can be changed.

A setlist has an author ("created by"), but anyone in the band can update it.

The same song may appear twice in a setlist (a hit played again at the encore): the editor warns, but allows it.
An archived song stays in the setlists that use it, marked as archived.

Limits: 50 songs per setlist, 5 parts per setlist, 50 setlists per band (archived ones not counted).

## Goal

A band can create as many setlists as it needs, within the limits.
Setlists are mainly meant for preparing gigs.
They may also be used to prepare rehearsals, recording sessions...

A setlist is easy to edit.
At every step, we can see the computed duration of the setlist, and of each of its parts if it has several:

- each song counts for its band's own duration, else its original one (brief 012);
- a song without either is not guessed: the duration says how many songs have none ("~42 min, 3 songs without a duration");
- breaks and the gaps between songs are not counted.

A setlist can be duplicated: a band reuses its usual setlist, adjusted for one gig, without changing the original.

Two members may edit the same setlist at once: a save made on an outdated version is refused, and the app offers to reload it, so nobody silently undoes someone else's changes.

Setlists are available offline, like the repertoire: without a network, members open the list of setlists and each setlist read-only; editing needs the network.

A setlist can be printed, for use during gigs and rehearsals.

A setlist can be viewed in "gig mode", full screen (as for lyrics).

## Lifecycle

A setlist can be archived and deleted.

- Any member archives and restores a setlist. An archived setlist is read-only, listed apart.
- Deleting is for good, by a band leader or the setlist's author.

Creating, changing, archiving, restoring and deleting a setlist are band journal events.

## Composition

I'll let you design a pleasant, easy and efficient user interface for the setlist editor.

- It works well on a phone: songs can be reordered by drag and drop, and also with move up / move down buttons (drag and drop alone is clumsy on a touch screen and inaccessible).
- Songs are added from a search:
  - by default, it shows only "ready" songs;
  - a control also shows the songs being learned ("learning", « en cours » in French);
  - a text box searches by title and artist.

## Design

There is a wireframe design here: https://claude.ai/artifact/5vGymfQdZuYKR8wMYYj1Ft
It was made without knowledge of this brief. It has to be redone to match this document (features and business rules).

It may be best to create a new artifact from scratch, inspired by the previous look and feel.

The new design comes first, before the editor is built.

## The Setlist Epic

In this first epic, we will deal with setlists alone.
There will be no links to other entities.

### Features

- Creating setlists
- Editing setlists
- Duplicating setlists
- Setlist lifecycle
- Setlists available offline

### Out of scope

- Printing a setlist
- Viewing a setlist in gig mode
- Any read-only view page of a setlist

## Issues

- [#275 Setlists Epic](https://github.com/TitoVince35/coverband/issues/275)
- [#270 Setlists: the new design](https://github.com/TitoVince35/coverband/issues/270)
- [#271 Setlists: list, create, rename, archive and delete](https://github.com/TitoVince35/coverband/issues/271)
- [#272 Setlists: the editor](https://github.com/TitoVince35/coverband/issues/272)
- [#273 Setlists: duplicate a setlist](https://github.com/TitoVince35/coverband/issues/273)
- [#274 Setlists: offline, read-only](https://github.com/TitoVince35/coverband/issues/274)
