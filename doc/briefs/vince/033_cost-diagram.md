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
- Not included: the Claude plan (not in the bills read) and the laptop.

## Versions

The page's source is in `doc/diagrams/`; the `infra-diagrams` skill regenerates and republishes it, adding a line here for each version.

- **v1.0**, Thursday 2026/11/12: first version, from the bills of October 2026 and November up to the 12th.
