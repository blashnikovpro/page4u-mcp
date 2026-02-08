# page4u-mcp

[MCP](https://modelcontextprotocol.io) server for [Page4U](https://page4u.ai) — lets AI assistants deploy landing pages, manage leads, and view analytics.

Works with Claude Code, Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.

## Setup

```bash
npm install -g page4u-mcp
```

Get your API key at [page4u.ai/dashboard/settings](https://page4u.ai/dashboard/settings).

### Claude Code

```bash
claude mcp add page4u -- env PAGE4U_API_KEY=p4u_your_key page4u-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "page4u": {
      "command": "page4u-mcp",
      "env": {
        "PAGE4U_API_KEY": "p4u_your_key_here"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "page4u": {
      "command": "page4u-mcp",
      "env": {
        "PAGE4U_API_KEY": "p4u_your_key_here"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `list_pages` | List all your landing pages |
| `get_page` | Get detailed info about a page |
| `deploy_page` | Deploy HTML with optional assets (images, CSS, JS) as a live landing page |
| `update_page` | Update page metadata (name, contact, colors) |
| `delete_page` | Permanently delete a page |
| `get_leads` | View leads from a page's contact form |
| `get_analytics` | View page analytics (views, clicks, submissions) |

## Example Prompts

Once connected, you can ask your AI assistant:

- *"Deploy this HTML as a landing page called my-bakery"*
- *"Deploy this landing page with its images and CSS files"*
- *"List all my pages"*
- *"Show me leads for my-bakery"*
- *"What are the analytics for my-bakery this month?"*
- *"Create a landing page for a pizza restaurant with WhatsApp ordering"*
- *"Update my-bakery's phone number to 050-1234567"*

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PAGE4U_API_KEY` | Yes | Your API key (starts with `p4u_`) |
| `PAGE4U_API_URL` | No | Custom API URL (default: `https://page4u.ai`) |

## Requirements

- Node.js >= 18

## License

MIT
