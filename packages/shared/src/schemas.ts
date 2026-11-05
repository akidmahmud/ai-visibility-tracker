import { z } from "zod";

// Mirrors the Prisma enums in packages/db so web and api share one definition.
export const ModelTag = z.enum(["chatgpt", "gemini", "perplexity", "google_aio", "google_ai_mode", "copilot", "claude"]);
export type ModelTag = z.infer<typeof ModelTag>;

export const RunFrequency = z.enum(["DAILY", "EVERY_2_DAYS", "EVERY_3_DAYS", "WEEKLY", "MONTHLY"]);
export type RunFrequency = z.infer<typeof RunFrequency>;

export const Intent = z.enum(["COMMERCIAL", "INVESTIGATIONAL", "INFORMATIONAL", "NAVIGATIONAL"]);
export type Intent = z.infer<typeof Intent>;

export const CreateBrand = z.object({
  name: z.string().trim().min(1).max(200),
  websiteUrl: z.string().trim().min(1).max(500),
  description: z.string().max(2000).optional(),
  industry: z.string().max(200).optional(),
  language: z.string().min(2).max(10).default("en"),
  country: z.string().length(2).default("US"),
  aliases: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  frequency: RunFrequency.default("WEEKLY"),
  enabledModels: z.array(ModelTag).default(["chatgpt", "gemini", "perplexity", "google_aio", "google_ai_mode"]),
});
export type CreateBrand = z.infer<typeof CreateBrand>;

export const UpdateBrand = CreateBrand.partial().extend({
  isActive: z.boolean().optional(),
  gscProperty: z.string().max(300).nullable().optional(),
  ga4PropertyId: z.string().regex(/^properties\/\d+$/).nullable().optional(),
});
export type UpdateBrand = z.infer<typeof UpdateBrand>;

const PromptText = z.string().trim().min(3).max(1000);

export const CreatePrompts = z.object({
  texts: z.array(PromptText).min(1).max(500),
  intent: Intent.default("COMMERCIAL"),
  topicId: z.uuid().optional(),
  location: z.string().max(200).optional(),
  source: z.enum(["MANUAL", "SUGGESTED", "FANOUT", "GSC"]).default("MANUAL"),
});
export type CreatePrompts = z.infer<typeof CreatePrompts>;

export const UpdatePrompt = z.object({
  text: PromptText.optional(),
  intent: Intent.optional(),
  topicId: z.uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  location: z.string().max(200).nullable().optional(),
});

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1d4ed8");

export const WhiteLabel = z.object({
  agencyName: z.string().trim().max(100).optional(),
  logoUrl: z.url().max(500).optional().or(z.literal("")),
  primaryColor: hex.optional(),
  accentColor: hex.optional(),
});
export type WhiteLabel = z.infer<typeof WhiteLabel>;

export const UpdateWorkspace = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  whiteLabel: WhiteLabel.optional(),
  // a hostname the agency points at us (CNAME) for share reports; null removes it
  customDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, "Enter a hostname like reports.agency.com")
    .nullable()
    .optional(),
});
export type UpdateWorkspace = z.infer<typeof UpdateWorkspace>;

export const PeekabooImport = z.object({ apiKey: z.string().trim().regex(/^pk_/, "Peekaboo keys start with pk_") });
export type PeekabooImport = z.infer<typeof PeekabooImport>;

export const UpdateTodo = z.object({ status: z.enum(["SUGGESTED", "TODO", "DONE", "ARCHIVED"]) });
export type UpdateTodo = z.infer<typeof UpdateTodo>;

export const CreateBrief = z.object({ promptId: z.uuid(), refresh: z.boolean().default(false) });
export type CreateBrief = z.infer<typeof CreateBrief>;

export const CreateTopic = z.object({ name: z.string().trim().min(1).max(100) });
export type CreateTopic = z.infer<typeof CreateTopic>;
export type UpdatePrompt = z.infer<typeof UpdatePrompt>;

export const SHARE_TABS = ["dashboard", "prompts", "competitors", "sources"] as const;
export const ShareTab = z.enum(SHARE_TABS);
export type ShareTab = z.infer<typeof ShareTab>;

export const CreateShareLink = z.object({
  visibleTabs: z.array(ShareTab).min(1).default([...SHARE_TABS]),
});
export type CreateShareLink = z.infer<typeof CreateShareLink>;

export const UpdateProviderRoute = z.object({
  primary: z.string().min(1),
  fallback: z.string().min(1).nullable(),
  enabled: z.boolean(),
});
export type UpdateProviderRoute = z.infer<typeof UpdateProviderRoute>;

export const TestProvider = z.object({
  model: ModelTag,
  provider: z.string().min(1),
  prompt: z.string().trim().min(3).max(1000),
  country: z.string().length(2).default("US"),
});
export type TestProvider = z.infer<typeof TestProvider>;

export const CreateCompetitor = z.object({
  name: z.string().trim().min(1).max(200),
  websiteUrl: z.string().trim().max(500).optional(),
});
export type CreateCompetitor = z.infer<typeof CreateCompetitor>;
