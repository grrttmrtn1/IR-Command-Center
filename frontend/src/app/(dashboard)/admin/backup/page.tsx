"use client";

import { useState } from "react";
import { Database, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function BackupPage() {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const resp = await fetch("/api/admin/backup/download", { credentials: "include" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: "Download failed" }));
        toast.error(err.detail ?? "Backup failed");
        return;
      }
      const cd = resp.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? "ircc-backup.sql";
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded");
    } catch {
      toast.error("Backup request failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Database className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Database Backup</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        Download a full PostgreSQL dump of the IR Command Center database. Requires Super Admin role.
      </p>

      <div className="rounded-xl border border-border bg-card p-6 mb-5">
        <h2 className="font-semibold mb-1">Download Backup</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Runs <code className="bg-muted px-1 rounded text-xs">pg_dump</code> on the server and streams the result as a{" "}
          <code className="bg-muted px-1 rounded text-xs">.sql</code> file. The file can be restored with{" "}
          <code className="bg-muted px-1 rounded text-xs">psql</code>.
        </p>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Generating backup…" : "Download SQL Backup"}
        </button>
      </div>

      <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-4">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-400 mb-1">Restore instructions</p>
            <p className="text-amber-700 dark:text-amber-500 mb-2">
              To restore from a backup, use <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded text-xs">psql</code> from a machine with access to the database:
            </p>
            <pre className="bg-amber-100 dark:bg-amber-900/30 rounded-lg p-3 text-xs overflow-x-auto text-amber-900 dark:text-amber-300">{`psql \\
  -h <db-host> -p 5432 \\
  -U ircc -d ircc \\
  < ircc-backup-YYYYMMDD-HHMMSS.sql`}</pre>
            <p className="text-amber-700 dark:text-amber-500 mt-2 text-xs">
              Always restore to an empty database or a test environment first. Restoring over an active database will cause data loss.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
