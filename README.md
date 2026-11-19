# OpenTime

OpenTime helps friends discover when invitations would be welcome and turn shared openings into confirmed plans, while keeping personal schedules private and participation voluntary.

**Course:** MIT 6.1040 Software Design, Fall 2026
**Team:** [Team members and working agreement](team.md)

## Current build

The repository has the Sync Engine, MongoDB, and Vue/Vite foundation. Users can register, sign in, restore a session after reload, and sign out. They can create groups, invite registered users by username, accept or decline invitations, and explicitly join through an owner-shared link. Owners can remove people or close a group; members can leave. Users can create private dated openings, share them with chosen groups, revise or withdraw them, and search for full-group overlaps by purpose and minimum duration. If no full-group time exists, search shows times for the largest available subset and names members without usable time there. An organizer can propose a gathering to current group members, invite more members, edit details into a new version, confirm the exact accepted roster, and cancel. Invitees can accept or decline; an accepted invitee can withdraw, and a pending invitee can join an already confirmed plan. Editing requires fresh responses and reconfirmation. Confirmed commitments are subtracted from overlaps. An in-app inbox shows group invitation and Gathering notices, with read state and destination links. Notification events are durable and retried after delivery failure.

### Run locally

Install Bun 1.4.2 and Podman with Compose. Start the Podman machine if needed, then run from the repository root:

```sh
bun install
bun install --cwd frontend
cp .env.example .env
bun run dev
```

The Vue development server is at `http://127.0.0.1:5173`. The backend is at `http://127.0.0.1:3000`; `GET /health` returns `{"status":"ok"}` when MongoDB is reachable. The project's MongoDB container uses local port 27018 so it can run beside another project using 27017. `bun run db:up` initializes an authenticated single-node replica set for transaction tests without clearing the existing MongoDB volume. The local URI uses `directConnection=true` and `replicaSet=rs0`; copy the current `.env.example` if an older `.env` lacks those options. `MONGODB_URL` names the database; production uses the platform-provided connection string and `client.db()`. The hosted database must support MongoDB transactions before confirmation can be deployed. Browser sessions use a Secure, HttpOnly, SameSite=Strict cookie. Set `PUBLIC_ORIGIN` to the exact browser origin in deployment settings.

To check the current project and run a production-style preview after MongoDB is up:

```sh
bun run generate
bun run check
bun run test
bun run preview
```

The preview serves built Vue files and `/api` from port 3000, with a fallback for Vue deep links. Tests use and reset only guarded `opentime_*_test` databases. `bun run db:down` stops the local MongoDB container without deleting its data.

## Pitch

[View the OpenTime pitch deck](https://docs.google.com/presentation/d/18HX2CHjc31JB2Bg-s9xxSwk-Zex411e68c8fTyNOnxk/edit?usp=sharing)

## Design Documents

- [Problem Framing](design/problem-framing.md) — Domain, stakeholders, bad situations, supporting evidence, comparables, solution sketch, and ethical analysis.
- [Concept Design](design/concept-design.md) — Concept specifications, essential reactions, design notes, and how the concepts work together.
- [Core User Journey](design/core-user-journey.md) — A narrative following a friend from a missed opportunity through proposing, revising, and confirming a gathering.
- [Development Plan](design/development-plan.md) — Checkpoint timeline, team responsibilities, and key risks with fallbacks.
- [Design Summary](design/design-summary.md) — A summary of how the concepts work together to solve the problem and address ethical concerns.
- [Visual Design Study](design/visual-design-study.md) — Two annotated slides establishing the app's typography, color, and layout.

## Mentor Meetings

[Meeting agendas and notes](mentor-meetings/)
