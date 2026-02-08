#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import AdmZip from "adm-zip";

const server = new McpServer({
  name: "page4u",
  version: "1.0.0",
});

// --- Helpers ---

const API_KEY = process.env.PAGE4U_API_KEY ?? "";
const BASE_URL = (process.env.PAGE4U_API_URL ?? "https://page4u.ai").replace(
  /\/+$/,
  ""
);

interface ApiSuccess<T> {
  success: true;
  data: T;
  total?: number;
}
interface ApiError {
  success: false;
  error: { code: string; message: string };
}

async function apiRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown> | FormData
): Promise<ApiSuccess<T>> {
  if (!API_KEY) {
    throw new Error(
      "PAGE4U_API_KEY environment variable is not set. Get your key at https://page4u.ai/dashboard/settings"
    );
  }

  const url = `${BASE_URL}/api/v1${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
    "X-Page4U-Client": "mcp",
  };

  let fetchBody: string | FormData | undefined;
  if (body instanceof FormData) {
    fetchBody = body;
  } else if (body) {
    headers["Content-Type"] = "application/json";
    fetchBody = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body: fetchBody });
  const json = (await res.json()) as ApiSuccess<T> | ApiError;

  if (!json.success) {
    throw new Error(`${json.error.code}: ${json.error.message}`);
  }

  return json;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

// --- Tools ---

server.registerTool(
  "list_pages",
  {
    description:
      "List all landing pages for the authenticated user. Returns slug, business name, status, and creation date.",
    inputSchema: {
      status: z
        .enum(["draft", "published", "archived"])
        .optional()
        .describe("Filter pages by status"),
    },
  },
  async ({ status }) => {
    const path = status ? `/pages?status=${status}` : "/pages";
    const { data, total } = await apiRequest<
      Array<{
        slug: string;
        businessName: string;
        status: string;
        createdAt: string;
      }>
    >("GET", path);

    if (data.length === 0) {
      return textResult("No pages found.");
    }

    const lines = data.map(
      (p) =>
        `- ${p.slug} | ${p.businessName || "(no name)"} | ${p.status} | ${new Date(p.createdAt).toLocaleDateString()}`
    );
    return textResult(
      `${total ?? data.length} page(s):\n\n${lines.join("\n")}`
    );
  }
);

server.registerTool(
  "get_page",
  {
    description:
      "Get detailed information about a specific page including business name, contact info, colors, and timestamps.",
    inputSchema: {
      slug: z.string().describe("The page URL slug"),
    },
  },
  async ({ slug }) => {
    const { data } = await apiRequest<Record<string, unknown>>(
      "GET",
      `/pages/${encodeURIComponent(slug)}`
    );
    return textResult(JSON.stringify(data, null, 2));
  }
);

server.registerTool(
  "deploy_page",
  {
    description:
      "Deploy a landing page with optional assets (images, CSS, JS). When assets are provided, they are bundled as a ZIP and uploaded together. The HTML can reference assets with relative paths (e.g. <img src=\"images/logo.png\">). Returns the live URL.",
    inputSchema: {
      html: z.string().describe("Complete HTML content for the page"),
      assets: z
        .array(
          z.object({
            filename: z
              .string()
              .describe(
                "File path relative to index.html (e.g. 'images/logo.png', 'css/style.css')"
              ),
            content: z.string().describe("Base64-encoded file content"),
          })
        )
        .optional()
        .describe(
          "Additional assets to include — images, CSS, JS, fonts, etc. Each asset has a filename (relative path) and base64-encoded content."
        ),
      slug: z
        .string()
        .optional()
        .describe(
          "Custom URL slug (lowercase, hyphens). Auto-generated if omitted."
        ),
      locale: z
        .enum(["he", "en"])
        .optional()
        .describe("Page language, default: he"),
      whatsapp: z
        .string()
        .optional()
        .describe("WhatsApp number for contact button"),
    },
  },
  async ({ html, assets, slug, locale, whatsapp }) => {
    const formData = new FormData();

    if (assets && assets.length > 0) {
      // Bundle HTML + assets into a ZIP
      const zip = new AdmZip();
      zip.addFile("index.html", Buffer.from(html, "utf-8"));
      for (const asset of assets) {
        zip.addFile(asset.filename, Buffer.from(asset.content, "base64"));
      }
      const zipBuffer = zip.toBuffer();
      formData.append(
        "file",
        new Blob([new Uint8Array(zipBuffer)], { type: "application/zip" }),
        "site.zip"
      );
    } else {
      formData.append(
        "file",
        new Blob([html], { type: "text/html" }),
        "index.html"
      );
    }

    if (slug) formData.append("slug", slug);
    if (locale) formData.append("locale", locale);
    if (whatsapp) formData.append("whatsapp", whatsapp);

    const { data } = await apiRequest<{
      slug: string;
      url: string;
      businessName: string;
      warnings?: string[];
    }>("POST", "/pages", formData);

    let result = `Page deployed!\n\nURL: ${data.url}\nSlug: ${data.slug}`;
    if (data.businessName) result += `\nName: ${data.businessName}`;
    if (assets?.length) result += `\nAssets: ${assets.length} file(s) included`;
    if (data.warnings?.length) {
      result += `\n\nWarnings:\n${data.warnings.map((w) => `- ${w}`).join("\n")}`;
    }
    return textResult(result);
  }
);

server.registerTool(
  "update_page",
  {
    description:
      "Update metadata for an existing page (business name, contact info, colors, tracking IDs).",
    inputSchema: {
      slug: z.string().describe("The page slug to update"),
      businessName: z.string().optional().describe("Business name"),
      headline: z.string().optional().describe("Page headline"),
      description: z.string().optional().describe("Page description"),
      phone: z.string().optional().describe("Phone number"),
      email: z.string().optional().describe("Email address"),
      whatsapp: z.string().optional().describe("WhatsApp number"),
      primaryColor: z.string().optional().describe("Primary brand color hex"),
      secondaryColor: z
        .string()
        .optional()
        .describe("Secondary brand color hex"),
      googleAnalyticsId: z.string().optional().describe("Google Analytics ID"),
      facebookPixelId: z.string().optional().describe("Facebook Pixel ID"),
    },
  },
  async ({ slug, ...fields }) => {
    // Filter out undefined values
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) body[k] = v;
    }

    if (Object.keys(body).length === 0) {
      return textResult("No fields to update.");
    }

    const { data } = await apiRequest<{
      slug: string;
      updated: string[];
    }>("PUT", `/pages/${encodeURIComponent(slug)}`, body);

    return textResult(
      `Page "${data.slug}" updated. Fields changed: ${data.updated.join(", ")}`
    );
  }
);

server.registerTool(
  "delete_page",
  {
    description: "Permanently delete a landing page. This cannot be undone.",
    inputSchema: {
      slug: z.string().describe("The page slug to delete"),
    },
  },
  async ({ slug }) => {
    await apiRequest("DELETE", `/pages/${encodeURIComponent(slug)}`);
    return textResult(`Page "${slug}" deleted.`);
  }
);

server.registerTool(
  "get_leads",
  {
    description:
      "Get leads (contact form submissions) for a page. Returns name, phone, email, message, and submission date.",
    inputSchema: {
      slug: z.string().describe("The page slug"),
      status: z.string().optional().describe("Filter by lead status"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Max results (default: 50)"),
    },
  },
  async ({ slug, status, limit }) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();

    const { data, total } = await apiRequest<
      Array<{
        name?: string;
        phone?: string;
        email?: string;
        message?: string;
        status: string;
        createdAt: string;
      }>
    >("GET", `/pages/${encodeURIComponent(slug)}/leads${qs ? `?${qs}` : ""}`);

    if (data.length === 0) {
      return textResult(`No leads found for "${slug}".`);
    }

    const lines = data.map((l) => {
      const parts = [];
      if (l.name) parts.push(`Name: ${l.name}`);
      if (l.phone) parts.push(`Phone: ${l.phone}`);
      if (l.email) parts.push(`Email: ${l.email}`);
      if (l.message) parts.push(`Message: ${l.message}`);
      parts.push(`Status: ${l.status}`);
      parts.push(`Date: ${new Date(l.createdAt).toLocaleDateString()}`);
      return parts.join(" | ");
    });

    return textResult(
      `${total ?? data.length} lead(s) for "${slug}":\n\n${lines.join("\n")}`
    );
  }
);

server.registerTool(
  "get_analytics",
  {
    description:
      "Get analytics for a page — page views, button clicks, WhatsApp clicks, phone clicks, email clicks, and form submissions.",
    inputSchema: {
      slug: z.string().describe("The page slug"),
      from: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD). Omit for all-time."),
      to: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD). Omit for all-time."),
    },
  },
  async ({ slug, from, to }) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();

    const { data } = await apiRequest<{
      slug: string;
      period: string | { from: string; to: string };
      totalEvents: number;
      page_view: number;
      button_click: number;
      whatsapp_click: number;
      phone_click: number;
      email_click: number;
      form_submit: number;
    }>(
      "GET",
      `/pages/${encodeURIComponent(slug)}/analytics${qs ? `?${qs}` : ""}`
    );

    const period =
      typeof data.period === "string"
        ? data.period
        : `${data.period.from} to ${data.period.to}`;

    return textResult(
      [
        `Analytics for "${slug}" (${period}):`,
        "",
        `Total Events:     ${data.totalEvents.toLocaleString()}`,
        `Page Views:       ${data.page_view.toLocaleString()}`,
        `Button Clicks:    ${data.button_click.toLocaleString()}`,
        `WhatsApp Clicks:  ${data.whatsapp_click.toLocaleString()}`,
        `Phone Clicks:     ${data.phone_click.toLocaleString()}`,
        `Email Clicks:     ${data.email_click.toLocaleString()}`,
        `Form Submits:     ${data.form_submit.toLocaleString()}`,
      ].join("\n")
    );
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Page4U MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
