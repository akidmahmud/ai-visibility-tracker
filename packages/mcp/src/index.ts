import type { IncomingMessage, ServerResponse } from "node:http";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

/** What the tools can read, already scoped to the caller's workspace by the API. */
export type McpData = {
  listBrands(): Promise<unknown>;
  summary(brandId: string, days: number, models?: string[]): Promise<unknown>;
  competitors(brandId: string, days: number): Promise<unknown>;
  prompts(brandId: string, days: number): Promise<unknown>;
  sources(brandId: string, days: number, view: "domains" | "urls"): Promise<unknown>;
  actionPlan(brandId: string): Promise<unknown>;
};

const ENGINES = ["chatgpt", "gemini", "perplexity", "google_aio", "google_ai_mode", "copilot", "claude"] as const;
const brandId = z.string().uuid().describe("Brand id from list_brands");
const days = z.number().int().min(1).max(365).default(30).describe("Look-back window in days");
const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

/** Read-only MCP server over this workspace's AI-visibility data. */
export function buildServer(data: McpData): McpServer {
  const server = new McpServer({ name: "ai-visibility-tracker", version: "1.0.0" });

  server.registerTool(
    "list_brands",
    { description: "List the brands tracked in this workspace (id, name, domain, engines, run frequency).", inputSchema: z.object({}) },
    async () => json(await data.listBrands()),
  );
  server.registerTool(
    "get_brand_summary",
    {
      description:
        "A brand's AI visibility (0-100: 100 = named first in every answer), mention rate, average position, sentiment and how often an AI answer appeared, plus every company the answers named, ranked.",
      inputSchema: z.object({ brandId, days, models: z.array(z.enum(ENGINES)).optional().describe("Limit to these AI engines") }),
    },
    async ({ brandId, days, models }) => json(await data.summary(brandId, days, models)),
  );
  server.registerTool(
    "get_competitors",
    { description: "Competitor leaderboard and each company's visibility per AI engine.", inputSchema: z.object({ brandId, days }) },
    async ({ brandId, days }) => json(await data.competitors(brandId, days)),
  );
  server.registerTool(
    "get_prompts",
    { description: "Tracked prompts with the brand's visibility on each, and who wins each prompt.", inputSchema: z.object({ brandId, days }) },
    async ({ brandId, days }) => json(await data.prompts(brandId, days)),
  );
  server.registerTool(
    "get_sources",
    {
      description: "Sites (or individual pages) AI engines cite for the brand's prompts, with owner and site type.",
      inputSchema: z.object({ brandId, days, view: z.enum(["domains", "urls"]).default("domains") }),
    },
    async ({ brandId, days, view }) => json(await data.sources(brandId, days, view)),
  );
  server.registerTool(
    "get_action_plan",
    { description: "The brand's prioritized to-dos with the evidence numbers behind each, and its latest site checkup.", inputSchema: z.object({ brandId }) },
    async ({ brandId }) => json(await data.actionPlan(brandId)),
  );
  return server;
}

/** Stateless Streamable HTTP: a fresh server + transport per request (no sessions to keep). */
export async function handleMcpRequest(req: IncomingMessage, res: ServerResponse, body: unknown, data: McpData) {
  const server = buildServer(data);
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
