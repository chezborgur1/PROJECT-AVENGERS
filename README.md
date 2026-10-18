# PROJECT AVENGERS

Tooling for AMB Advisory Services. Each folder is a self-contained section
with its own README, dependencies and tests.

| Section | What it does | Status |
|---|---|---|
| [`amb-material-bot/`](amb-material-bot/) | Reads the high-priority request list and builds a three-statement financial model (.xlsx) and a 10-page CIM (.pptx) per business, plus the open questions to confirm with the seller | v0.1: runs end to end on the sample deal. Claude drafting and QuickBooks Online have not run against the live services yet |
| [`seller-lead-engine/`](seller-lead-engine/) | Finds Main Street owners likely to sell from public state records (Florida Sunbiz and DBPR first), emails them a free exit-readiness check from a named AMB person behind a compliance gate, qualifies replies as drafts for review, and hands warm sellers to the advisor with a weekly report | v0.1: runs end to end offline on fictional sample data; not yet run against live Gmail, Places or a verifier; licensing allow-list and postal address must be filled before any send |

## Adding a section

Create a new top-level folder with its own `README.md` and, if it has code,
its own `package.json` and tests. Keep client data out of git: every section
ignores its own `output/`, `deals/`, `.env` and credential files.

## Setup on your computer

1. Install [Git](https://git-scm.com/downloads) and [Node.js LTS](https://nodejs.org).
2. `git clone https://github.com/grzepcasey-ui/project-avengers`
3. Windows: double-click `setup.bat`. Mac: `bash setup.sh`.
4. Reference models go in `amb-material-bot/references/model-templates/` and past CIMs in `amb-material-bot/references/cims/` (upload them on github.com or commit them).
5. Seller lead engine: fill in `seller-lead-engine/config/engine.config.json` and `seller-lead-engine/.env`, then follow `seller-lead-engine/docs/RUNBOOK.md`. It sends nothing until the licensing sign-off and postal address are filled in.
