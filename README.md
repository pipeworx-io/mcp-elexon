# @pipeworx/elexon

Elexon BMRS Insights MCP — Great Britain electricity grid and wholesale market data. Keyless.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1679+ live data sources.

## Tools

- `generation_by_fuel(from, to)` — half-hourly GB generation in MW per fuel type (FUELHH), plus a `byFuel` total per fuel over the window.
- `system_demand(from, to)` — half-hourly GB transmission system demand outturn in MW (ITSDO).
- `elexon_list_datasets(search?)` — the directory of all 84 BMRS datasets: code, title, and which window parameters its route takes. Search by keyword ("wind", "price", "forecast") to find a code before calling `query_dataset`.
- `query_dataset(dataset, from, to, settlement_period?, date_param?)` — records from any of the 84 datasets by code. The correct window parameters are chosen per dataset automatically.
- `elexon_system_prices(settlement_date, settlement_period?)` — GB imbalance prices (system buy / system sell, GBP/MWh) per settlement period, with net imbalance volume and price derivation code (DISEBSP). Elexon serves this outside `/datasets`, so `query_dataset` cannot reach it.

A GB settlement day has 48 half-hour settlement periods.

## Auth

None. No key, no signup, no quota we have hit.

## The 404 that means two different things

Elexon answers `404 {"statusCode":404,"message":"Resource not found"}` for **both**
an unknown dataset code **and** a known code queried with the wrong window
parameters, because the window parameters are part of route resolution.
`/datasets/MID?publishDateTimeFrom=...` is a 404 even though MID exists and is
one of the most-wanted datasets in the pack — MID's route takes `from`/`to`.

That is why this pack carries a `DATASETS` table instead of passing the code
straight through. It maps each of the 84 codes to one of five window styles:

| Style | Query parameters | Datasets |
|---|---|---|
| `publishDateTime` | `publishDateTimeFrom` / `publishDateTimeTo` | 53, incl. FUELHH, ITSDO, WINDFOR, REMIT, TEMP |
| `from` | `from` / `to` | 22, incl. MID, BOD, BOALF, QAS, MELS |
| `settlementDate` | `settlementDate` + `settlementPeriod` | 6: B1610, MDB, MDO, PN, QPN, TUDM |
| `measurementDateTime` | `measurementDateTimeFrom` / `To` | 1: FREQ |
| `submissionDateTime` | `submissionDateTimeFrom` / `To` | 2: RZDF, RZDR |

Consequences worth knowing:

- The six `settlementDate` datasets are served **one settlement period at a
  time**, so `query_dataset` needs `settlement_period` (1–48) for those. It says
  so by name rather than 404ing.
- An unrecognised code is rejected by the pack, before the upstream call, with
  the near-matches and the full code list in the message. It never books as a
  Pipeworx defect (fleet #584: 49 identical 404s in three hours, every one a
  caller guessing a code, all filed as our bug).
- A **real** code with an empty window returns zero records, not a 404. If you
  get a 404 from a code that exists, the window parameters were what was
  rejected.
- `date_param` overrides the lookup and is rarely needed. The legacy value
  `"settlement"` means `settlementDateFrom`/`To`, which only FUELHH and FUELINST
  accept; `"settlementDate"` is the per-period style above.

## What callers actually guess

Measured from a day of live traffic, two classes of guess account for most of
the wasted calls, and the pack now answers both:

- **ENTSO-E B-flow codes.** B1620, B1430 and B1440 were all tried. Elexon's spec
  records the mapping in its own summaries ("Actual Aggregated Generation Per
  Type (AGPT / B1620)"), so the pack resolves 16 B-codes onto the dataset that
  superseded them and reports `resolved_from` in the response.
- **The imbalance price.** SYSTEMPRICE, SYSTEMPRICES, CASH, IMBALPR, B1770 and
  B1780 were tried 14 times between them. None is a dataset code — GB system
  buy/sell prices live at `/balancing/settlement/system-prices`, which is what
  `elexon_system_prices` wraps. Those guesses now get pointed at it by name
  instead of a list of 84 codes, none of which is the one they want.

## Regenerating the dataset table

Elexon adds datasets. The table in `src/index.ts` comes from the upstream
OpenAPI spec — note it is served from the site root, **not** under the API base:

```bash
curl -s https://data.elexon.co.uk/swagger/v1/swagger.json
```

Read the `/datasets/{CODE}` paths; a dataset's window style is whichever of
`publishDateTimeFrom` / `from` / `settlementDate` / `measurementDateTimeFrom` /
`submissionDateTimeFrom` its `parameters` declare.

## Data sources

- API base: `https://data.elexon.co.uk/bmrs/api/v1`
- OpenAPI spec: `https://data.elexon.co.uk/swagger/v1/swagger.json`
- Docs: `https://bmrs.elexon.co.uk/api-documentation`

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "elexon": {
      "url": "https://gateway.pipeworx.io/elexon/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/elexon/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1679+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/generation_by_fuel \
  -H 'Content-Type: application/json' \
  -d '{"from":"2024-06-01T00:00Z","to":"2024-06-01T01:00Z"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/generation_by_fuel`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "elexon": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-elexon"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-elexon
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Elexon data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
