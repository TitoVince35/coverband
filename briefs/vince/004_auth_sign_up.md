# Authentication and sign-up

> 🕒 Brief posted on Friday 2026/10/16 00:21

NB: After each brief, I may ask you to "correct and review" it.
- **Correct** means: make sure the document is clear and written in proper English.
- **Review** means: you are invited to challenge the brief.

## Changes to issue #6

- Authentication with email and password is fine.
- Public sign-up should not be offered for now.

## Additional specifications

- The only way to get an account is through an invitation.
- Admins can log in to an administration console at `/admin`.

### Roles

- **Admin:** an owner of the application. There may be several. A default admin account, with a valid email address and a password, is created at startup from environment variables. Admins can create band leaders.
- **Leader:** a band leader invites users (musicians) to join their band and manages the band's details.
- **Musician:** a member of one or more bands. Their account is created from an invitation email if they don't have one yet. They are then added to the band whose leader sent the invitation.

### Workflows

#### Creating a band leader

1. The admin logs in to the administration console.
2. They see the list of users and their roles.
3. They create a new band leader from an email address. This sends an invitation email, valid for 48 hours.
4. The future leader opens the email and clicks the link.
5. They go through a wizard with these steps:
   1. Basic profile: first name, last name, nickname, instrument.
   2. Basic band profile: band name (unique), genre.
   3. Confirmation of the email address, profile and band, then creation of the user (as leader) and of the band.
   4. Credentials: to be discussed later.
   5. Welcome: the band's home page.

#### Inviting a musician

1. The leader is logged in and on their band's lineup page, which lists all the band's musicians, including the leader.
2. They click "Invite a musician" and send an invitation to an email address.
3. The musician receives an email saying that <leader> invites them to join <band> on CoverBand, and clicks the link.
4. If they don't have an account yet, they go through a wizard with these steps:
   1. Basic profile: first name, last name, nickname, instrument.
   2. Confirmation of the email address, profile and band they are joining, then creation of the user (as musician), who joins the band.
   3. Credentials: to be discussed later.
   4. Welcome: the band's home page.
5. If they already have an account, they are asked to log in. They then choose their instrument in this band and confirm that they want to join. They join the band and land on its home page.

### Credentials

Creating a reasonably strong password is a good start.
Later, I'd like to study adding TOTP (with the option to trust a device for a set period) or logging in with third-party providers.
