interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Elexon BMRS Insights MCP — Great Britain electricity grid & market data.
 *
 * Keyless wrapper over the Elexon Balancing Mechanism Reporting Service (BMRS)
 * Insights API: half-hourly generation by fuel type (wind/gas/nuclear/etc),
 * system demand, and market index (day-ahead) prices. Each settlement day has
 * 48 half-hour settlement periods.
 */


const BASE = 'https://data.elexon.co.uk/bmrs/api/v1';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'generation_by_fuel',
    description:
      'Great Britain half-hourly electricity generation by fuel type (Elexon BMRS FUELHH dataset). Returns MW generated per fuel (CCGT/gas, COAL, NUCLEAR, WIND, BIOMASS, NPSHYD hydro, PS pumped-storage, OCGT, OIL, and interconnector flows INTFR/INTIRL/etc) for each half-hour settlement period. Keyless. 48 settlement periods per day.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Publish-time start, ISO datetime, e.g. "2024-06-01T00:00Z".' },
        to: { type: 'string', description: 'Publish-time end, ISO datetime, e.g. "2024-06-01T01:00Z".' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'system_demand',
    description:
      'Great Britain electricity system demand outturn (Elexon BMRS ITSDO — Initial Transmission System Demand Outturn) over a datetime window. Returns demand in MW per half-hourly settlement period. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start, ISO datetime, e.g. "2024-06-01T00:00Z".' },
        to: { type: 'string', description: 'End, ISO datetime, e.g. "2024-06-01T01:00Z".' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'query_dataset',
    description:
      'Generic escape hatch for any Elexon BMRS Insights dataset (e.g. MID market index/day-ahead prices, DGWS actual wind/solar generation, FUELHH generation by fuel). Pass a dataset code and a datetime window; pick the date parameter style with date_param. Keyless. Returns the raw records.',
    inputSchema: {
      type: 'object',
      properties: {
        dataset: { type: 'string', description: 'Dataset code, e.g. "MID", "DGWS", "FUELHH".' },
        from: { type: 'string', description: 'Window start, ISO datetime.' },
        to: { type: 'string', description: 'Window end, ISO datetime.' },
        date_param: {
          type: 'string',
          description:
            'Date parameter style: "publishDateTime" (default → publishDateTimeFrom/To), "settlement" (→ settlementDateFrom/To, use plain dates like "2024-06-01"), or "from" (→ from/to).',
        },
      },
      required: ['dataset', 'from', 'to'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'generation_by_fuel': {
        const from = reqStr(args, 'from');
        const to = reqStr(args, 'to');
        const qs = `publishDateTimeFrom=${enc(from)}&publishDateTimeTo=${enc(to)}&format=json`;
        const data = await getRecords(`/datasets/FUELHH?${qs}`);
        const generation = data.map((r) => ({
          time: r.startTime,
          settlementDate: r.settlementDate,
          settlementPeriod: r.settlementPeriod,
          fuelType: r.fuelType,
          mw: r.generation,
        }));
        const byFuel: Record<string, number> = {};
        for (const r of generation) {
          if (typeof r.fuelType === 'string' && typeof r.mw === 'number') {
            byFuel[r.fuelType] = (byFuel[r.fuelType] ?? 0) + r.mw;
          }
        }
        return { count: generation.length, generation, byFuel };
      }
      case 'system_demand': {
        const from = reqStr(args, 'from');
        const to = reqStr(args, 'to');
        const qs = `publishDateTimeFrom=${enc(from)}&publishDateTimeTo=${enc(to)}&format=json`;
        const data = await getRecords(`/datasets/ITSDO?${qs}`);
        const demand = data.map((r) => ({
          time: r.startTime ?? r.publishTime,
          settlementDate: r.settlementDate,
          settlementPeriod: r.settlementPeriod,
          demand: r.demand,
        }));
        return { count: demand.length, demand };
      }
      case 'query_dataset': {
        const dataset = reqStr(args, 'dataset');
        const from = reqStr(args, 'from');
        const to = reqStr(args, 'to');
        const style = (args.date_param as string | undefined) ?? 'publishDateTime';
        let qs: string;
        if (style === 'settlement') {
          qs = `settlementDateFrom=${enc(from)}&settlementDateTo=${enc(to)}&format=json`;
        } else if (style === 'from') {
          qs = `from=${enc(from)}&to=${enc(to)}&format=json`;
        } else {
          qs = `publishDateTimeFrom=${enc(from)}&publishDateTimeTo=${enc(to)}&format=json`;
        }
        const data = await getRecords(`/datasets/${enc(dataset)}?${qs}`);
        return { dataset, count: data.length, records: data };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Fetch a BMRS path and return the records array, tolerating {data:[...]} or a bare array. */
async function getRecords(path: string): Promise<Array<Record<string, any>>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Elexon ${res.status}: ${text.slice(0, 200)}`);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Elexon: non-JSON response: ${text.slice(0, 200)}`);
  }
  if (Array.isArray(body)) return body as Array<Record<string, any>>;
  if (body && typeof body === 'object' && Array.isArray((body as any).data)) {
    return (body as any).data as Array<Record<string, any>>;
  }
  throw new Error(`Elexon: unexpected response shape: ${JSON.stringify(body).slice(0, 200)}`);
}

function enc(v: string): string {
  return encodeURIComponent(v);
}

function reqStr(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Required argument "${key}" is missing or empty.`);
  }
  return v;
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
