# Loyverse MCP

A [Model Context Protocol](https://modelcontextprotocol.io) server for the
[Loyverse](https://loyverse.com) point-of-sale API. It lets an MCP client read and
manage a Loyverse account: catalogue, stock, customers, receipts and sales reporting.

Built against the published Loyverse API v1.0 reference. Every read tool in this
repository has been run against a live Loyverse account.

## What it does

Twenty-six read tools and fifteen write tools across the whole documented API surface,
plus one tool the API does not provide: `loyverse_sales_summary` aggregates a date
range into totals and a ranked breakdown, so a question like "what sold best last week"
costs one call instead of paging through hundreds of receipts.

| Area | Tools |
|---|---|
| Account | merchant profile, stores, employees, shifts, POS devices, payment types, suppliers |
| Catalogue | items, variants, categories, modifiers, discounts, taxes |
| Stock | inventory levels, absolute stock setting |
| Customers | loyalty customers, visits, points |
| Sales | receipts, receipt creation, refunds |
| Reporting | sales summary by day, item, category, payment type, employee or store |
| Integration | webhook subscriptions |

## Requirements

- Node.js 20 or newer
- A Loyverse account and an access token

## Getting a token

In the Loyverse back office, go to **Settings > Access tokens**, add a token, and copy
it. The token grants full access to the account, so treat it as a password. If a token
is ever exposed, delete it in the same screen and issue a new one.

## Install

```bash
npm install && npm run build
```

## Connect it to Claude

Add the server to your MCP client's configuration. For Claude Desktop, edit
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

## Example prompts

- "What were my top five selling dishes last week, and how much did each bring in?"
- "Which items are down to fewer than three in stock at my main store?"
- "Add a new item called Mango Lassi at £3.50 in the Drinks category, then set its
  opening stock to 40."

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
