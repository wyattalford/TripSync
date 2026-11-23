# OpenTime

OpenTime helps friends discover when invitations would be welcome and turn shared openings into confirmed plans, while keeping personal schedules private and participation voluntary.

**Course:** MIT 6.1040 Software Design, Fall 2026
**Team:** [Team members and working agreement](team.md)

## Current build

The repository has the Sync Engine, MongoDB, and Vue/Vite foundation. Users can register, sign in, restore a session after reload, and sign out. They can create groups, invite registered users by username, accept or decline invitations, and explicitly join through an owner-shared link. Owners can remove people or close a group; members can leave. Users can create purpose-free dated openings, share them with all current groups or a selected subset, revise or withdraw them, and view aggregate availability in the shared calendar. New groups are not added to an existing opening automatically. The calendar can show everyone or only selected members, filter by date and minimum duration, and carry a chosen interval and invitees into a proposal. Individual openings remain private; confirmed commitments are subtracted from shared availability. An organizer can propose a gathering with a purpose to current group members, invite more members, edit details into a new version, confirm the exact accepted roster, and cancel. Invitees can accept or decline; an accepted invitee can withdraw, and a pending invitee can join an already confirmed plan. Editing requires fresh responses and reconfirmation. An in-app inbox shows group invitation and Gathering notices, with read state and destination links. Notification events are durable and retried after delivery failure.

[Generated API reference](generated/opentime.md) · [Alpha release status and validation](design/development-plan.md#8-alpha-release-status)

The OpenTime hourglass is a local SVG used in the header and as the browser icon: [hourglass.svg](frontend/public/hourglass.svg).

### Run locally

Install Bun 1.4.2 and Podman with Compose. Start the Podman machine if needed, then run from the repository root:

```sh
bun install
bun install --cwd frontend
cp .env.example .env
bun run dev
```

The Vue development server is at `http://127.0.0.1:5173`. The backend is at `http://127.0.0.1:3000`; `GET /health` returns `{"status":"ok"}` when MongoDB is reachable. The project's MongoDB container uses local port 27018 so it can run beside another project using 27017. `bun run db:up` starts the existing authenticated local replica set; the app also runs on standalone MongoDB, as provided by the course. `MONGODB_URL` names the database; production uses the platform-provided connection string and `client.db()`. Browser sessions use a Secure, HttpOnly, SameSite=Strict cookie. Set `PUBLIC_ORIGIN` to the exact browser origin in deployment settings.

To check the current project and run a production-style preview:

```sh
bun run generate
bun run check
bun run test
bun run preview
```

The preview serves built Vue files and `/api` from port 3000, with a fallback for Vue deep links. Tests use and reset only guarded `opentime_*_test` databases. `bun run db:down` stops the local MongoDB container without deleting its data.

### Alpha validation and release

[Watch the narrated Alpha user journey](https://drive.google.com/file/d/1GNy_hlNqsa6d0yTXKlV8FH6leV3036St/view?usp=sharing)

On November 22, the merged `main` branch passed 147 tests against a disposable standalone MongoDB, Sync Engine and design checks, backend and Vue type checks, and the production build. A local four-person browser walkthrough covered group invitations, purpose-free openings, selected-member search, proposal, confirmation, versioned editing, fresh responses, reconfirmation, late acceptance, and the organizer's notification.

### Deploy on 6.1040 Apps

The course platform deploys a GitHub commit. The `opentime` app is live at [opentime.mit-sdg.dev](https://opentime.mit-sdg.dev/). Its settings are:

| Setting | Value |
| --- | --- |
| Repository | `https://github.com/wyattalford/TripSync` |
| Branch | `main` is currently configured in 6.1040 Apps; deployment uses the exact chosen commit SHA |
| Runtime | Bun |
| Package directories | `.` and `frontend` |
| Build script | `build` |
| Start script | `start` |
| Port | `3000` |
| Health check | `/health` |

The platform MongoDB is configured to expose `MONGODB_URL`. Check that `PUBLIC_ORIGIN` equals the exact HTTPS origin, `https://opentime.mit-sdg.dev`, without a trailing slash. The platform supplies `HOST`, `PORT`, and `NODE_ENV`; do not copy local `.env` values into its settings. Alpha uses conditional document updates and a single-process Gathering change queue; it does not require MongoDB transactions. Concurrent changes across multiple app instances can still produce conflicting commitments. After each release, smoke-test sign-in, an opening, a gathering confirmation, notices, and a reload at the public URL.

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
