# Cost study diagram

> 🕒 Brief posted on Thursday 2026/11/12 22:23

Starting from the architecture diagram, I want to keep every item/box. For the text, no mention of what each piece does, but a cost indication instead.

Then a table with every service:
- Name
- Characteristics (hardware, volume...)
- Cost or limitation

Then a card summarizing the average cost per month and per year.

## Result

The page: [Coverband running costs](https://claude.ai/artifact/CYttxpfv4ni2rjqydDb8pm) (a private artifact, shared from its Share menu).

- Scaleway figures come from the real bills, read from Scaleway's billing API: October 2026 (€14.37, from the go-live on the 19th, with the domain) and November up to the 12th (€6.83), projected to a full month.
- About **€21.45 a month before VAT** (€25.74 with VAT), **€263 a year** with the domain (€316 with VAT). The database is 64% of it, the container 35%; everything else costs cents or nothing.
- The €20 monthly budget alert will likely go off in November.
- Not included: the development tools (the laptop, the Claude plan) and the band members' phones, which cost the app nothing: since v1.1 they aren't on the page at all.

## Versions

The page's source is in `doc/diagrams/`; the `infra-diagrams` skill regenerates and republishes it, adding a line here for each version.

- **v1.0**, Thursday 2026/11/12: first version, from the bills of October 2026 and November up to the 12th.
- **v1.1**, Thursday 2026/11/12: the Development group (Vince's laptop, Claude) and the band members' phones taken off the diagram and the table, as useless on a cost page; same figures.
- **v1.2**, Friday 2026/11/13: the "Average cost" card before the "Every service" table; same figures.
- **v1.3**, Friday 2026/11/13: a shorter first sentence ("The architecture services, with what each costs.").
- **v1.4**, Friday 2026/11/13: "On the Internet" renamed "Third-party services".
- **v1.5**, Friday 2026/11/13: in the "Every service" table, "Characteristics" and "Cost or limitation" as wide as each other (the cost notes wrap); same figures.
