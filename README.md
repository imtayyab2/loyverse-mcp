<img src="assets/icon.png" alt="Loyverse MCP server icon: a paper receipt" width="96" align="right">

# Loyverse MCP Server

**Connect Claude to your Loyverse point-of-sale account.** An open-source
[Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives Claude
Desktop, Claude Code and any other MCP client read and write access to your
[Loyverse](https://loyverse.com) catalogue, inventory, customers, receipts and sales
reports.

[![Release](https://img.shields.io/github/v/release/imtayyab2/loyverse-mcp?label=release)](https://github.com/imtayyab2/loyverse-mcp/releases)
[![Licence](https://img.shields.io/github/license/imtayyab2/loyverse-mcp)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-server-blue)](https://modelcontextprotocol.io)

Ask questions about your shop in plain English and get answers from live till data, or
have Claude update your catalogue and stock for you. Install it as a one-click Claude
Desktop extension, or run it from source in any MCP client.

Built against the published Loyverse API v1.0 reference. Every read tool in this
repository has been run against a live Loyverse account.

## What you can ask

Once connected, these all work without you touching the Loyverse back office:

- **Sales reporting.** "What were my top five selling dishes last week, and how much did
  each bring in?" or "Compare cash against card takings for the last fortnight."
- **Stock checks.** "Which items are down to fewer than three in stock at my main store?"
- **Catalogue edits.** "Add a new item called Mango Lassi at £3.50 in the Drinks
  category, then set its opening stock to 40."
- **Reconciliation.** "Show me every shift that closed more than £5 away from the
  expected cash."
- **Customer lookups.** "Which loyalty customers have not visited in 60 days?"

## Why this exists

The Loyverse API returns raw receipts. Answering "what sold best last week" from those
means paging through hundreds of records, which is slow and burns a lot of context.

This server adds `loyverse_sales_summary`, a tool the API does not provide. It
aggregates a date range into totals and a ranked breakdown by day, item, category,
payment type, employee or store, in a single call. Everything else maps closely to the
underlying API so nothing is hidden from you.

## Features

Twenty-six read tools and fifteen write tools across the whole documented API surface.

| Area | Tools |
|---|---|
| Account | merchant profile, stores, employees, shifts, POS devices, payment types, suppliers |
| Catalogue | items, variants, categories, modifiers, discounts, taxes |
| Stock | inventory levels, absolute stock setting |
| Customers | loyalty customers, visits, points |
| Sales | receipts, receipt creation, refunds |
| Reporting | sales summary by day, item, category, payment type, employee or store |
| Integration | webhook subscriptions |

Also included: cursor pagination handled for you, automatic retry with backoff against
the API rate limit, and errors translated into plain sentences rather than bare status
codes.

## Requirements

- Node.js 20 or newer, for the from-source install only
- A Loyverse account and an access token

## Getting a Loyverse access token

In the Loyverse back office, go to **Settings > Access tokens**, add a token, and copy
it. The token grants full access to the account, so treat it as a password. If a token
is ever exposed, delete it in the same screen and issue a new one.

## Install as a Claude Desktop extension

The quickest route, and nothing to build. Download `loyverse.mcpb` from the
[releases page](https://github.com/imtayyab2/loyverse-mcp/releases), then drag it onto
Claude Desktop's extensions settings. Claude asks for your access token on install and
stores it as a sensitive value. The bundle carries the whole server in one file and has
no `node_modules` to install.

To build the bundle yourself:

```bash
npm install && npm run bundle
```

That produces `loyverse.mcpb` at the repository root.

## Install from source

```bash
npm install && npm run build
```

Then add the server to your MCP client's configuration. For Claude Desktop, edit
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "loyverse": {
      "command": "node",
      "args": ["/absolute/path/to/loyverse-mcp/dist/index.js"],
      "env": { "LOYVERSE_ACCESS_TOKEN": "your-token-here" }
    }
  }
}
```

For local development, copy `.env.example` to `.env`, put the token there and run
`npm run dev`. The `.env` file is gitignored and must stay that way.

### Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `LOYVERSE_ACCESS_TOKEN` | yes | — | Loyverse access token |
| `LOYVERSE_API_BASE` | no | `https://api.loyverse.com/v1.0` | Override the API host |
| `LOYVERSE_TIMEOUT_MS` | no | `30000` | Per-request timeout |

## Things the Loyverse API will not do

These are limits of the upstream API, not of this server. The tools report them as
plain sentences rather than bare status codes.

- **Sales history stops at 31 days.** Older ranges return `402` unless the account has
  the Unlimited Sales History add-on.
- **Rate limit is 300 requests per 300 seconds.** The client retries a `429` with
  exponential backoff, three times by default.
- **Stock is absolute, not a delta.** `loyverse_set_inventory` takes `stock_after`, the
  level to leave in place. Read the current level first if you mean to add or remove.
- **A receipt created through the API carries one payment type.** Split tender is
  rejected before the request is sent.
- **Updates use POST, not PUT.** Passing an existing id to an upsert tool updates that
  record.
- **Pages cap at 250 objects.** The client follows cursors for you and tells you when a
  result was truncated.

## Safety

Tools are annotated so a client can tell them apart:

- Twenty-six tools are `readOnlyHint` and change nothing.
- `loyverse_set_inventory`, `loyverse_refund_receipt` and `loyverse_delete` are
  `destructiveHint`. They overwrite stock, move money and remove records, and none of
  it can be undone through the API.
- The remaining write tools create or update records and are idempotent when given an id.

The server instructions tell the model to state what will change and get agreement
before calling any tool that writes.

## Development

```bash
npm test          # unit tests, no network
npm run typecheck
npm run smoke     # every read-only tool against the live account in .env
```

`npm run smoke` never calls a write tool.

## FAQ

**Is this an official Loyverse integration?**
No. It is an independent open-source project, not built, endorsed or supported by
Loyverse.

**Do I need a paid Loyverse plan?**
No. The only paid feature that matters here is Unlimited Sales History, without which
the API serves the last 31 days of receipts.

**Which MCP clients does it work with?**
Any of them. It has been tested with Claude Desktop, as a `.mcpb` extension and through
`claude_desktop_config.json`. The desktop extension is the easiest route.

**Is my sales data sent anywhere?**
No. Requests go only to `api.loyverse.com`. The server has no database, no logging and
no analytics. See the Privacy Policy below.

**Can it change or delete my data?**
Yes. Fifteen of the forty-one tools write, and three of those are irreversible. They are
annotated so your client can warn you, but treat the access token as full account
access, because that is what Loyverse gives it.

**Does it support more than one store?**
Yes. Tools that make sense per store take a `store_id`, and the sales summary can group
by store.

**Does it support Loyverse OAuth instead of an access token?**
Not yet. OAuth is needed for a hosted, multi-tenant deployment and is planned. The
client is already written to take a token per session, so it is a transport change
rather than a rewrite.

## Privacy Policy

This server is a local client for an API you already have an account with. It stores no
data of its own.

- **What it collects.** Nothing. The server keeps no database, no log file and no
  analytics.
- **What it transmits.** Requests go only to `api.loyverse.com` over HTTPS, carrying
  your access token and the arguments of the tool you called. Responses are returned to
  your MCP client and held only in memory for the duration of the call.
- **Third parties.** None, other than Loyverse itself. Data handling on their side is
  governed by the [Loyverse privacy policy](https://loyverse.com/privacy-policy).
- **Personal data.** The customer tools read and write names, emails, phone numbers and
  addresses that live in your Loyverse account. This server passes them through and
  retains nothing.
- **Retention.** No data is retained after a tool call returns.
- **Your token.** Read from the environment at startup and held in memory only. It is
  never written to disk by this server and never sent anywhere but Loyverse.
- **Contact.** Raise an issue on this repository.

## Relationship to Loyverse

This is an independent, unofficial project. It is not built, endorsed or supported by
Loyverse. "Loyverse" is a trademark of its owner.

## Licence

MIT. See [LICENSE](LICENSE).
