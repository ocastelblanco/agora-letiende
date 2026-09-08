<div align="center">

# Ágora

**Box office ticketing for the theater of Le Tiende**

[![Live](https://img.shields.io/badge/live-agora.letiende.co-E8630A?style=flat-square)](https://agora.letiende.co)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Angular](https://img.shields.io/badge/Angular-22-DD0031?style=flat-square&logo=angular&logoColor=white)](https://angular.dev)
[![AWS](https://img.shields.io/badge/AWS-Lambda_·_DynamoDB_·_API_Gateway-232F3E?style=flat-square&logo=amazonaws&logoColor=white)](https://aws.amazon.com)
[![Serverless](https://img.shields.io/badge/IaC-Serverless_Framework_4-FD5750?style=flat-square&logo=serverless&logoColor=white)](https://serverless.com)
[![Firebase](https://img.shields.io/badge/Auth-Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com)
[![SLIM](https://img.shields.io/badge/Best%20Practices%20from-SLIM-blue?style=flat-square)](https://nasa-ammos.github.io/slim/)
[![Español](https://img.shields.io/badge/leer_en-Español-FFE7B3?style=flat-square)](./README.es.md)

</div>

---

Ágora is the box office system for **Le Tiende**, a cultural venue in Bogotá, Colombia, running in production at [**agora.letiende.co**](https://agora.letiende.co). It lets a `customer` buy tickets for an event with no account required, a `producer` review payment receipts and see their event's sales status, and a `gatekeeper` validate entry at the door by scanning each ticket's QR code. An `administrator` creates and edits events, and manages team access to the system.

The goal is to replace the manual process — WhatsApp conversations, receipts checked by hand, scattered attendee lists, and entry validated by reading names off paper — with an end-to-end digital flow, with no overselling and without piling simultaneous work onto the Le Tiende team.

[PRD](docs/PRD.md) | [Technical specs](docs/tech-specs.md) | [v2/v3 roadmap (non-technical)](docs/roadmap-v2-v3.md) | [TODO / active roadmap](docs/TODO.md) | [Project memory](docs/MEMORY.md)

## Features

* Public event listing, no authentication required, indexable via SSR, with a downloadable QR code for posters
* Ticket purchase with temporary seat reservation (no overselling) and payment receipt upload, with active release of expired reservations
* Receipt approval by the producer, with automatic digital ticket issuance
* Digital ticket with a unique QR code, delivered by email
* Door validation by QR scan, with a clear verdict (valid / already used / nonexistent / from another event)
* Cash sales from the door or in person
* Ticketing stages (early bird, box office, etc.) with automatic closing by date
* Event dashboard (sold, available, checked in, seats pending confirmation) with Excel report export
* Ágora-specific user and role management (`administrator` / `producer` / `gatekeeper`), authorization per assigned event
* Google sign-in (Firebase Authentication), a project shared with Comandante and Babel
* Optional ticketing for free events (capacity control only) and events ticketed by a third party (announced on the listing with an external link)
* Automatic sync of every event to Google Calendar
* Automatic online payment by card or PSE via **Bold** (embedded checkout, no leaving the site), as an alternative to manual bank transfer — confirmed by a signed, reconciled webhook, never by whatever the customer's browser reports

What comes after v1 — WhatsApp notifications and PDF report export — is described for a non-technical audience in [`docs/roadmap-v2-v3.md`](docs/roadmap-v2-v3.md).

## Project status

**Ágora has been in production** since August 14, 2026, at [`agora.letiende.co`](https://agora.letiende.co). The full lifecycle of an event (create, sell, charge, issue ticket, validate at the door) works end to end. Product and architecture documentation lives in [`docs/PRD.md`](docs/PRD.md) and [`docs/tech-specs.md`](docs/tech-specs.md); detailed status and the decisions made along the way are in [`docs/MEMORY.md`](docs/MEMORY.md). Active tasks (if any) are in [`docs/TODO.md`](docs/TODO.md) — the project can sit without an active task while waiting for real usage feedback before prioritizing what comes next.

## Contents

* [Tech Stack](#tech-stack)
* [Quick Start](#quick-start)
* [Security and Cost](#security-and-cost)
* [Contributing](#contributing)
* [License](#license)
* [Support](#support)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 22.x (standalone components, Signals, SSR via `@angular/ssr`) |
| UI | Angular Material 22.x + Tailwind CSS 4.x, a custom Material 3 theme with the Le Tiende palette |
| Backend | Node.js 24.x on AWS Lambda + API Gateway (IaC with Serverless Framework 4) |
| Database | AWS DynamoDB (always `PAY_PER_REQUEST` — see `CLAUDE.md`) |
| Authentication | Google Firebase Authentication (project shared with Comandante and Babel, independent roles) |
| Email | AWS SES, from `taquilla@letiende.co` |
| QR code | Server-side generation + `@zxing/browser` for door scanning |
| Target infrastructure cost | **< US$1/month**, measured — see `docs/advertencia-urgente-costos-aws.md` |

Full detail in [`docs/tech-specs.md`](docs/tech-specs.md) and [`CLAUDE.md`](CLAUDE.md).

## Quick Start

### Requirements

* Node.js 24.x
* AWS account (for Lambda/DynamoDB deployment)
* Firebase project shared with Comandante and Babel (Authentication)

### Setup

```bash
git clone https://github.com/ocastelblanco/agora-letiende.git
cd agora-letiende
npm install
```

### Run in development

```bash
npm run start          # local dev server (ng serve)
```

### Production build (SSR)

```bash
npm run build -- --configuration=production
npm run serve:ssr
```

### Tests

```bash
npm run test           # frontend unit tests
npm run test:api       # backend unit tests (Lambdas in server/)
```

## Security and Cost

Ágora handles real money and the personal data of customers with no account — the mandatory security rules (access control, overselling prevention, receipt handling, Habeas Data) are in [`CLAUDE.md`](CLAUDE.md) §5. Infrastructure cost rules (DynamoDB always `PAY_PER_REQUEST`, budgets, tagging) are in the "Costos de infraestructura" section of the same document and in [`docs/advertencia-urgente-costos-aws.md`](docs/advertencia-urgente-costos-aws.md) — mandatory reading before touching any infrastructure. The **< US$1/month** target was set at project kickoff (own ADR, `docs/MEMORY.md`) as a direct reaction to a real, already-resolved incident in **Babel** (a sibling project, same AWS account): US$94.44 billed in one month against a declared US$0 target, 96% of it from a misconfigured `PROVISIONED` DynamoDB table. Ágora never repeated that mistake: every table has used `PAY_PER_REQUEST` since its very first infrastructure task.

## Contributing

Every code change goes through a Pull Request to `main` from a `feature/*`, `fix/*`, `docs/*`, `hotfix/*` or `refactor/*` branch. See the full flow (including the absolute Git prohibitions) in [`CLAUDE.md`](CLAUDE.md) §6.

Code, commits, comments and database identifiers are written in **Spanish**; the interface is Spanish (Colombia).

## License

See [`LICENSE`](LICENSE).

## Support

Internal Le Tiende project. For questions or support, contact the Le Tiende team.
