# Job HQ

A local dashboard for a job hunt, built on top of [career-ops](https://github.com/career-ops-hq/career-ops).
It reads and writes career-ops' `data/applications.md`, shows what the scanner found, runs rescans from the browser, and can prepare a tailored CV, cover letter and contacts for the roles you care about.

Everything runs on your machine. The server only listens on localhost and nothing is sent anywhere unless you send it yourself.

## Contents

1. [Setup](#setup)
2. [How it fits together](#how-it-fits-together)
3. [User guide](#user-guide)
4. [Keyboard shortcuts](#keyboard-shortcuts)
5. [Configuration](#configuration)
6. [Troubleshooting](#troubleshooting)
7. [Before you scan](#before-you-scan)

## Setup

You need Node 20 or newer and a working [career-ops](https://github.com/career-ops-hq/career-ops) install with your CV and `portals.yml` already set up.

```bash
git clone https://github.com/aliflkpd/job-hq.git
cd job-hq
npm install
CAREER_OPS_DIR=~/path/to/career-ops npm start
```

Then open **http://127.0.0.1:4747**. Type `http://` yourself: some browsers force `https://` on `localhost` and show an SSL error.

`CAREER_OPS_DIR` defaults to `~/Developer/career-ops`. The first run creates `data/store.json` for your own data (contacts, notes, dismissed roles, settings). That file is git-ignored.

## How it fits together

| Where | What lives there |
| --- | --- |
| career-ops `data/applications.md` | Your applications. The source of truth. Job HQ writes status changes back to it. |
| career-ops `data/scan-history.tsv`, `data/pipeline.md` | Everything the scanner has read, including listed pay. Read only. |
| career-ops `portals.yml` | The filters you settled on. Job HQ never edits it. |
| `job-hq/data/store.json` | Contacts, timeline, next actions, dismissed roles, scan adjustments. |
| `Andy AI/Job Applications/<Company>/` (see Configuration to change it) | CV PDF, cover letter and outreach notes for each prepared role. |

## User guide

### The five pages

**Today** is the page to open every morning.
- *To do*: follow-ups that are due and people you still need to reach out to, grouped per company.
- *Auto-prep*: what the background preparation is doing or has finished.
- *Ready to submit*: applications whose documents are prepared. Click **Apply** to open the real application page.
- *Best new matches*: the strongest open roles from the last scan.
- *Rescan*: the scan panel (see below).

**Applications** is your pipeline.
- Board view with the columns To apply, Applied, Responded, Interview, Offer. Drag a card to change its status, or use the arrow on the card.
- Table view for a compact list.
- Below the board: **Not available** (the posting was closed or taken down), **Rejected**, **Skipped**.
- Click a card to open its drawer (see below). **Add** creates an application by hand.

**Discover** lists the roles the scanner found, in four tabs.
- *Open to me*: in Indonesia or remote from anywhere, and a real digital design role.
- *Needs a visa*: overseas roles (Singapore, Malaysia, Australia and so on). Posts rarely say whether they sponsor visas, so confirm with the recruiter.
- *Filtered out*: hidden by your settings (limited to residents of other regions, or not a digital design job). You can still track one if you disagree.
- *Dismissed*: roles you hid. Restore them any time.

**Contacts** lists people and inboxes per application, with status To contact, Sent, Replied or Skipped.

**Insights** shows the funnel from all scanned postings down to the ones you applied to, where the roles are, which boards pay off, and the highest listed pay.

### Working a role from Discover

1. Read the row. The number is a **fit estimate from 0 to 100**. Click the title to see the exact reasons behind each point. It is rule-based (title, region, level, how recent, pay against your minimum), not an AI reading of the whole posting.
2. Chips on the row tell you more: *New*, *Check title* (a vague title such as "Product Designer" can be a physical product job), *Agency or hidden* (posted by a recruiter), *Below your floor* (listed pay under your minimum), *Applied here before* (you already applied to this company).
3. Use the icons on the right of the row:
   - **PDF icon**: prepare a CV, cover letter and contacts (see Auto-prep).
   - **Check-circle**: you already applied outside this app (see below).
   - **Plus**: track it in Applications.
   - **Eye-off**: dismiss it (an Undo appears).
   - **Arrow**: open the posting.
4. Narrow the list with search, **country** (the dropdown lists the countries in the current tab with counts, for example Singapore or Malaysia under Needs a visa), **work type** (Remote, Hybrid, On-site, Not stated), **posted within**, sort order, *New*, *Has pay listed* and *Hide Staff and above*. Work type comes only from the location text, so many postings say "Not stated". Check the posting itself before relying on On-site.

### The application drawer

Click any application to open it.
- **Where to apply**: the button opens the real application page. Email links and extra links sit under it.
- **Status**: the chip at the top changes the status. The change is written to `applications.md`, so career-ops tools see it too.
- **Next action**: one task with a due date. Marking an application Applied sets "Follow up if nobody has replied" for 7 days later.
- **Reach out**: contacts with **LinkedIn**, **Email** (opens your mail app with a subject), **WhatsApp** and **Copy message** buttons. LinkedIn drafts show a character counter that turns red above 200.
- **Documents**: the CV PDF opens in a new tab. The cover letter and notes expand inline with a Copy button.
- **Details, Notes, Timeline**: pay, location, your private notes, and a log of everything that happened. Type in the timeline box and press Enter to add an entry.

### Marking a job you already applied to

For roles you applied to outside this app, click the check-circle on a Discover row (or **I already applied** in the drawer). Pick the real date, where you applied (company site, Jobstreet, LinkedIn, email, referral) and an optional note. The role moves to **Applied** with that date, the timeline records it, and a follow-up reminder is set 7 days after the date you picked. Other postings from the same company are then flagged "Applied here before".

### Rescan

The **Rescan** card (on Today and Discover) runs career-ops' `scan.mjs` with your filters.

- **Where**: *Everywhere*, *Indonesia only* (Jobstreet ID, Kalibrr, Tech in Asia, Glints and local companies) or *International only* (remote boards, global company sites, Singapore, Malaysia, Australia).
- **Look back**: your configured number of days, or the last 7, 14 or 30.
- **Run scan**: about two minutes for a short look-back, up to ten for a full one. A log is under *Show log*. If a few boards fail (for example behind a firewall) the scan still finishes and the failures are listed.
- New roles are marked **New**. Use the *New* toggle in Discover to see only those, and *Mark all seen* when you are done.

### Adjust the scan filters

Click **Adjust** on the Rescan card.
- **Roles**: the title keywords a posting must contain. Add or remove tags.
- **Posted within**: 7 to 90 days. This also hides older roles from the lists right away.
- **Minimum pay**: in million rupiah per month. Roles that list pay below it get a warning and a lower fit. Roles with no listed pay are not removed.
- **Sources**: switch individual job boards and company career sites on or off.
- **After a scan**: the Auto-prep settings below.

These changes are applied to a temporary copy of `portals.yml` for each scan. **Reset to settled** returns to your real career-ops settings. If you scan from the career-ops terminal instead, the original settings are used.

### Auto-prep: CV, cover letter and contacts without asking

After a scan, Job HQ picks the strongest new roles that are open to you (strong fit, not Staff level, not already tracked, up to the maximum you set) and prepares each one in the background:

1. An agent reads the posting and checks eligibility first. If you clearly do not qualify (residency limits, far more years than you have, skills with no proof in your CV, hidden employer), the role is marked **Skipped** with the reason and no CV is made.
2. Otherwise it builds a tailored CV with career-ops, checks it against your `cv.md`, writes a 100 to 130 word cover letter, and looks up public contacts (recruiters, hiring managers, official recruiting inboxes).
3. The application appears in **To apply** with the documents, the apply link, the contacts and a "Review the CV and letter, then submit" task.
4. When the batch is done you get a WhatsApp message (Hermes users, see Configuration).

You can also prepare a role by hand: the PDF icon in Discover, **Prepare CV, letter and contacts** in a drawer, or just add an application with **Add** or **Track** and it is prepared automatically.

**Always review before you send.** Nothing is ever submitted or emailed for you. Read the cover letter and the CV (agents can make typos or phrase things badly), and treat contacts as leads to verify: LinkedIn pages cannot be read without login, so contact details come from public search results only. Each prepared role uses one agent session, which counts against your usage, so keep the per-scan maximum modest.

Auto-prep needs [Hermes](https://hermes-agent.nousresearch.com) (`hermes chat`) or another agent command (see Configuration), plus career-ops with a filled-in `cv.md`.

### Contacts

- **Add contact** on a company group or in a drawer. Paste a LinkedIn link, email, WhatsApp number and a message draft.
- Set the status as you go. Marking one **Sent** or **Replied** adds a timeline entry.
- Use only email addresses that are public on the company site or the job post. Do not use personal emails or phone numbers from someone's profile.

## Keyboard shortcuts

Press `?` in the app for the list.

| Key | Action |
| --- | --- |
| `1` to `5` | Today, Applications, Discover, Contacts, Insights |
| `/` | Search |
| `j` / `k` | Next / previous role in Discover |
| `o` | Open the focused posting |
| `p` | Prepare CV, letter and contacts |
| `a` | Mark as already applied |
| `t` | Track the role |
| `x` | Dismiss the role |
| `n` | New application (on Applications) |
| `Esc` | Close the panel |

## Configuration

Environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `CAREER_OPS_DIR` | `~/Developer/career-ops` | Your career-ops folder |
| `PORT` | `4747` | Server port |
| `JOBHQ_STORE` | `data/store.json` | Where your own data is saved |
| `JOBHQ_AGENT_CMD` | `hermes` | Command used for auto-prep. It is called as `<cmd> chat --query-file <file> -Q` |
| `JOBHQ_AGENT_SKILLS` | none | Comma-separated skills passed to the agent with `-s` |
| `JOBHQ_CANDIDATE` | `full_name` from career-ops `config/profile.yml` | Name used in CV file names (also editable under Adjust) |

Documents are saved under `~/Developer/Andy AI/Job Applications/<Company>/`. Change `DOCS_ROOT` in `lib/config.mjs` to use another folder.

WhatsApp notifications use a Hermes cron job with a small script that prints `data/notify.json` and deletes it. Skip it if you do not use Hermes; the Today page shows the same information.

To change which companies count as "local" for the Indonesia only scan, edit `LOCAL_RE` and `LOCAL_COMPANIES` in `lib/scan.mjs`. The fit estimate lives in `lib/classify.mjs`. After adding icons, run `npm run sprite`.

## Troubleshooting

- **Page does not load or shows an SSL error**: use `http://127.0.0.1:4747` with `http://` typed in. The server listens on both `127.0.0.1` and `::1`.
- **Lists are empty**: `CAREER_OPS_DIR` is wrong, or career-ops has not scanned yet. Run a scan.
- **A scan says some boards failed**: a board blocked or timed out. The rest still ran. Turn the failing board off under Adjust if it keeps happening.
- **Auto-prep shows Failed**: open the role and press **Try again**. If it keeps failing, check that `hermes chat` works in a terminal. Restarting Job HQ while a prep is running marks that prep as failed.
- **A prepared CV looks wrong**: the CV is built from your career-ops `cv.md`. Fix the source there, then try again.
- **Status shows "Not available"**: this is career-ops' `Discarded` state under a friendlier label, so career-ops' own tools keep working.

## Before you scan

Job boards have their own terms of service, and many forbid automated scraping. This tool is meant to run on your own machine for your own search. Check each source's terms before you scrape it, do not redistribute scraped postings, and do not collect or share recruiters' personal contact details beyond what is public and needed for your own application.

## Credits

Built on [career-ops](https://github.com/career-ops-hq/career-ops) (MIT). Icons: [Phosphor](https://phosphoricons.com) (MIT). Fonts: Plus Jakarta Sans and Space Mono (SIL OFL).
