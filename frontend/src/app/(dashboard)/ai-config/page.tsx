"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Eye, EyeOff, Cpu, CheckCircle2, AlertCircle } from "lucide-react";

interface ProviderConfig {
  api_key?: string;
  endpoint?: string;
  deployment?: string;
  api_version?: string;
  model?: string;
}

interface AIConfigResponse {
  default_provider: string;
  providers: Record<string, { configured: boolean; model?: string }>;
}

const PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-opus-4-5", "claude-sonnet-4-5"],
    fields: ["api_key", "model"],
    modelHint: "e.g. claude-sonnet-4-6",
  },
  {
    id: "openai",
    name: "OpenAI GPT",
    models: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini", "o3-mini", "gpt-4.1", "gpt-4.1-mini"],
    fields: ["api_key", "model"],
    modelHint: "e.g. gpt-4o",
  },
  {
    id: "azure_openai",
    name: "Azure OpenAI",
    models: [],
    fields: ["api_key", "endpoint", "deployment", "api_version"],
    modelHint: "",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash"],
    fields: ["api_key", "model"],
    modelHint: "e.g. gemini-2.5-flash",
  },
];

export default function AIConfigPage() {
  const qc = useQueryClient();
  const [configs, setConfigs] = useState<Record<string, ProviderConfig>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [defaultProvider, setDefaultProvider] = useState("anthropic");
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data: aiConfig } = useQuery({
    queryKey: ["ai-config"],
    queryFn: () => api.get<AIConfigResponse>("/ai/config").then((r) => r.data),
  });

  useEffect(() => {
    if (aiConfig) {
      setDefaultProvider(aiConfig.default_provider);
      const initial: Record<string, ProviderConfig> = {};
      for (const [id, info] of Object.entries(aiConfig.providers)) {
        initial[id] = { model: info.model ?? "" };
      }
      setConfigs(initial);
    }
  }, [aiConfig]);

  const saveMutation = useMutation({
    mutationFn: (data: { default_provider: string; providers: Record<string, ProviderConfig> }) =>
      api.patch("/ai/config", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-config"] });
      toast.success("AI configuration saved");
    },
    onError: () => toast.error("Failed to save configuration"),
  });

  async function testProvider(providerId: string) {
    setTestingId(providerId);
    try {
      await api.post("/ai/generate", {
        provider: providerId,
        messages: [{ role: "user", content: "Reply with 'OK' only." }],
        max_tokens: 10,
      });
      toast.success(`${PROVIDERS.find((p) => p.id === providerId)?.name} — connection successful`);
    } catch {
      toast.error(`Connection test failed for ${providerId}`);
    } finally {
      setTestingId(null);
    }
  }

  function updateConfig(providerId: string, field: string, value: string) {
    setConfigs((prev) => ({ ...prev, [providerId]: { ...(prev[providerId] ?? {}), [field]: value } }));
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">AI Configuration</h1>
          <p className="text-muted-foreground mt-1">Configure AI providers for task generation, comms drafts, and analysis</p>
        </div>
        <button
          onClick={() => saveMutation.mutate({ default_provider: defaultProvider, providers: configs })}
          disabled={saveMutation.isPending}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saveMutation.isPending ? "Saving..." : "Save Configuration"}
        </button>
      </div>

      {/* Default provider */}
      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <h3 className="font-semibold mb-3">Default AI Provider</h3>
        <p className="text-sm text-muted-foreground mb-4">Used when no specific provider is requested</p>
        <div className="flex gap-3 flex-wrap">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => setDefaultProvider(p.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                defaultProvider === p.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted/30"
              }`}
            >
              {aiConfig?.providers[p.id]?.configured
                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                : <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />}
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Provider cards */}
      <div className="space-y-4">
        {PROVIDERS.map((provider) => (
          <div key={provider.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Cpu className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">{provider.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {aiConfig?.providers[provider.id]?.configured
                      ? <span className="text-green-500">Configured</span>
                      : <span className="text-muted-foreground">Not configured</span>}
                    {aiConfig?.providers[provider.id]?.model && ` · ${aiConfig.providers[provider.id].model}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => testProvider(provider.id)}
                disabled={testingId === provider.id || !aiConfig?.providers[provider.id]?.configured}
                className="px-3 py-1.5 border border-border text-xs rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
              >
                {testingId === provider.id ? "Testing..." : "Test Connection"}
              </button>
            </div>
            <div className="p-5 space-y-3">
              {provider.fields.map((field) => {
                const listId = `${provider.id}-model-list`;
                return (
                  <div key={field}>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {field.replace(/_/g, " ")}
                    </label>
                    {field === "model" && provider.models.length > 0 ? (
                      <div className="mt-1.5">
                        <input
                          list={listId}
                          value={configs[provider.id]?.model ?? ""}
                          onChange={(e) => updateConfig(provider.id, "model", e.target.value)}
                          placeholder={provider.modelHint || "Enter or select model..."}
                          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <datalist id={listId}>
                          {provider.models.map((m) => <option key={m} value={m} />)}
                        </datalist>
                        <p className="text-xs text-muted-foreground mt-1">Type any model name or pick from the suggestions</p>
                      </div>
                    ) : (
                      <div className="relative mt-1.5">
                        <input
                          type={field === "api_key" && !showKey[`${provider.id}_${field}`] ? "password" : "text"}
                          value={(configs[provider.id] as Record<string, string>)?.[field] ?? ""}
                          onChange={(e) => updateConfig(provider.id, field, e.target.value)}
                          placeholder={field === "api_key" ? "Enter API key..." : `Enter ${field.replace(/_/g, " ")}...`}
                          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary pr-10"
                        />
                        {field === "api_key" && (
                          <button
                            onClick={() => setShowKey((prev) => ({ ...prev, [`${provider.id}_${field}`]: !prev[`${provider.id}_${field}`] }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showKey[`${provider.id}_${field}`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl bg-muted/30 border border-border p-4">
        <p className="text-xs text-muted-foreground">
          API keys are encrypted with AES-256-GCM before storage. They are never returned to the browser after saving.
          To update a key, simply enter the new value and save.
        </p>
      </div>
    </div>
  );
}
