# mcp-elexon

Elexon BMRS Insights MCP — Great Britain electricity grid & market data.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `generation_by_fuel` | Great Britain half-hourly electricity generation by fuel type (Elexon BMRS FUELHH dataset). Returns MW generated per fuel (CCGT/gas, COAL, NUCLEAR, WIND, BIOMASS, NPSHYD hydro, PS pumped-storage, OCGT, OIL, and interconnector flows INTFR/INTIRL/etc) for each half-hour settlement period. Keyless. 48 settlement periods per day. |
| `system_demand` | Great Britain half-hourly electricity system demand outturn in MW (Elexon BMRS ITSDO dataset) over a required ISO-datetime window; returns one row per settlement period with settlementDate, settlementPeriod, and demand fields. |
| `query_dataset` | Generic escape hatch for any Elexon BMRS Insights dataset (e.g. MID market index/day-ahead prices, DGWS actual wind/solar generation, FUELHH generation by fuel). Pass a dataset code and a datetime window; pick the date parameter style with date_param. Keyless. Returns the raw records. |

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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Elexon data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
