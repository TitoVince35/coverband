# Infrastructure diagram

> 🕒 Brief posted on Thursday 2026/11/12 21:58

Create an artifact with Coverband's architecture diagram, showing the infrastructure of the forge and of the hosting services.

Here is the list of the components I want on the diagram.
Arrows or other symbols may show how they relate.

### GitHub
- Actions (CI/CD)
- Projects (Kanban board)
- Git (code repository)

### Scaleway
- Serverless Container
    - Coverband REST API
    - Coverband PWA (frontend)
    - Coverband admin (back office)
- Serverless SQL Database (PostgreSQL)
- Transactional Email (SMTP)
- Domain (DNS)
- Cockpit (logs)

### Push notifications
- The browsers' push services, signed with our VAPID key

### Claude
- Full-stack developer, UX/UI consultant

### My laptop
- Product design
- Prompting

## Corrections (Claude, Thursday 2026/11/12)

Checked against `infra/` and the code:
- "Serverless instance" is a Serverless Container: one container, where the API also serves the PWA and the admin app (on its own hostname).
- "Managed database" is a Serverless SQL Database (PostgreSQL).
- "SMTP server" is Scaleway's Transactional Email (TEM), reached over SMTP.
- "Logpit" is Scaleway's Cockpit, which collects the container's logs.
- "Vapid" isn't a provider: VAPID is our own key, which signs each push notification. The server sends them, with the `web-push` library, to the push service of each phone's browser (Google's for Chrome and Android, Mozilla's, Apple's, Microsoft's), which delivers them.
- Added to the diagram, as they are part of the hosting: Object Storage (documents, logos, avatars, setlist exports), the Container Registry (the images Actions builds), the cron trigger (the nightly activity purge), and the services the API calls (LRCLIB for lyrics, Deezer and YouTube for "Search and add").

## Result

The diagram: [Coverband architecture](https://claude.ai/artifact/PxD1bMuYLdTpSo2CTipAR7) (a private artifact, shared from its Share menu).
