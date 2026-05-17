"use client";

import { ExternalLink, Code2, BookOpen } from "lucide-react";

export default function APIDocsPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">API Documentation</h1>
          <p className="text-muted-foreground mt-1">Interactive REST API reference with OpenAPI 3.0</p>
        </div>
        <div className="flex gap-2">
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm rounded-lg hover:bg-muted transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Open Swagger UI
          </a>
          <a
            href="/redoc"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm rounded-lg hover:bg-muted transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            Open ReDoc
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <a
          href="/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-border bg-card p-6 hover:border-primary/50 hover:bg-muted/20 transition-colors group"
        >
          <Code2 className="h-8 w-8 text-primary mb-3" />
          <h3 className="font-semibold mb-1">Swagger UI</h3>
          <p className="text-sm text-muted-foreground">Interactive API playground — try requests directly in your browser</p>
          <p className="text-xs text-primary mt-3 group-hover:underline">Open at /docs →</p>
        </a>
        <a
          href="/redoc"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-border bg-card p-6 hover:border-primary/50 hover:bg-muted/20 transition-colors group"
        >
          <BookOpen className="h-8 w-8 text-primary mb-3" />
          <h3 className="font-semibold mb-1">ReDoc</h3>
          <p className="text-sm text-muted-foreground">Clean, readable API reference documentation</p>
          <p className="text-xs text-primary mt-3 group-hover:underline">Open at /redoc →</p>
        </a>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 mb-4">
        <h3 className="font-semibold mb-4">Authentication</h3>
        <div className="space-y-4 text-sm">
          <div className="flex gap-3">
            <span className="bg-muted px-2 py-0.5 text-xs rounded font-mono shrink-0 mt-0.5">Bearer</span>
            <div>
              <p className="font-medium">API Key Authentication</p>
              <p className="text-muted-foreground text-xs mt-0.5">Include your API key in the Authorization header for all external API calls.</p>
              <code className="text-xs font-mono bg-muted px-2 py-1 rounded block mt-2">Authorization: Bearer ircc_your_api_key_here</code>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="font-semibold mb-4">API Scopes</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { scope: "incidents:read", desc: "Read incidents, IOCs, assets, tasks" },
            { scope: "incidents:write", desc: "Create and update incidents" },
            { scope: "documents:read", desc: "Read documents and templates" },
            { scope: "tasks:read", desc: "Read organization tasks" },
            { scope: "tasks:write", desc: "Create and update tasks" },
            { scope: "audit:read", desc: "Read audit log entries" },
            { scope: "comms:read", desc: "Read communications drafts" },
          ].map(({ scope, desc }) => (
            <div key={scope} className="flex gap-3 p-3 rounded-lg bg-muted/30">
              <code className="text-xs font-mono text-primary shrink-0 mt-0.5">{scope}</code>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
