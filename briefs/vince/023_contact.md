# Contact form

> 🕒 Brief posted on Friday 2026/10/23 14:03
>
> 🕒 Brief settled on Friday 2026/10/23 14:13
>
> 🕒 Issues completed on Friday 2026/10/23 14:23

A contact form lets users write to the app's team.

### Recipient

The email address is in an environment variable: `CONTACT_FORM_RECIPIENT`.

- In production, it defaults to the admin email (`admin_email` in `infra/`), applied before the code that needs it is merged.
- Unset (local development without it, tests), the form isn't offered. `.env.example` sets it, so locally the email lands in Mailpit.

## The form

- "Contact us" in the account menu (the avatar), next to "My account", opens its own page, for every logged-in user (never a band's settings: musicians couldn't reach it).
- No name to type: the page says who it's sent as (name and email); the email to the team has the user's address as Reply-To.
- Offline, Send is disabled.

### Fields

- Subject: a selector, required, with no default ("Choose a subject").
- Message: required, 10 to 5,000 characters.
- Send button. If sending fails, the user is told and the message stays in the form.

### Subjects

- Bug report
- Feature request
- Praise
- Other

A bug report also carries the app's version, the page the user came from, the browser and the language; the form says so.

### The email

- In English only (written to the team, not to a user): the one email outside the users' languages.
- Its subject line is built from the chosen subject's code; nothing typed goes into the headers, and the message is escaped in the body.
- No copy to the user: a confirmation on screen. Email only: messages aren't kept in the database.

### Security

- A rate limit: no more than 5 emails a day per user; over it, "too many requests" with the waiting time.
- Activity: `contact.sent`, with the subject's code only, never the message.

## Issues

- [#235 Contact form Epic](https://github.com/TitoVince35/coverband/issues/235)
- [#233 Contact: the recipient in the infrastructure](https://github.com/TitoVince35/coverband/issues/233)
- [#234 Contact form: the Contact us page and its email](https://github.com/TitoVince35/coverband/issues/234)
