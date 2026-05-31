"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eye, Code } from "lucide-react";

interface MarkdownViewerProps {
  content: string;
  className?: string;
  defaultRaw?: boolean;
  compact?: boolean;
  hideToggle?: boolean;
}

export function MarkdownViewer({ content, className = "", defaultRaw = false, compact = false, hideToggle = false }: MarkdownViewerProps) {
  const [raw, setRaw] = useState(defaultRaw);

  return (
    <div className={className}>
      {!hideToggle && (
        <div className="flex justify-end mb-2">
          <button
            onClick={() => setRaw(!raw)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded transition-colors"
            title={raw ? "Show rendered view" : "Show raw markdown"}
          >
            {raw ? <Eye className="h-3 w-3" /> : <Code className="h-3 w-3" />}
            {raw ? "Preview" : "Raw"}
          </button>
        </div>
      )}
      {raw ? (
        <pre className={`whitespace-pre-wrap font-mono text-sm text-foreground bg-muted/30 rounded-lg p-3 ${compact ? "max-h-64 overflow-y-auto" : ""}`}>
          {content}
        </pre>
      ) : (
        <div className={`prose prose-sm dark:prose-invert max-w-none text-foreground ${compact ? "max-h-64 overflow-y-auto" : ""}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2 first:mt-0">{children}</h1>,
              h2: ({ children }) => <h2 className="text-lg font-semibold mt-4 mb-2 first:mt-0">{children}</h2>,
              h3: ({ children }) => <h3 className="text-base font-semibold mt-3 mb-1 first:mt-0">{children}</h3>,
              p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
              ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
              li: ({ children }) => <li className="text-foreground">{children}</li>,
              code: ({ children, className: cls }) => {
                const isBlock = cls?.includes("language-");
                return isBlock
                  ? <code className="block bg-muted/50 rounded p-3 text-xs font-mono overflow-x-auto">{children}</code>
                  : <code className="bg-muted/50 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>;
              },
              blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/30 pl-4 text-muted-foreground italic my-3">{children}</blockquote>,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              a: ({ href, children }) => <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
              hr: () => <hr className="border-border my-4" />,
              table: ({ children }) => (
                <div className="overflow-x-auto my-3">
                  <table className="w-full text-sm border-collapse">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-muted/40">{children}</thead>,
              th: ({ children }) => <th className="border border-border px-3 py-2 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">{children}</th>,
              td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,
              del: ({ children }) => <del className="line-through text-muted-foreground">{children}</del>,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
