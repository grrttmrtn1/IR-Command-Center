# Foundation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the entire frontend with skeleton loaders, consistent empty states, rich text editing everywhere, an upgraded command palette, and a first-run onboarding checklist.

**Architecture:** All changes are frontend-only (no backend migrations). Shared UI primitives (`Skeleton`, `EmptyState`, `RichTextEditor`) are created first and then applied across all pages. The command palette extends the existing `GlobalSearch` component. Tiptap stores markdown, keeping storage format backwards-compatible with the existing `MarkdownViewer`.

**Tech Stack:** Next.js 15 App Router, Tiptap 2.x (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `tiptap-markdown`), Tailwind CSS, lucide-react

---

### Task 1: Install Tiptap Dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install packages**

Run inside the `frontend/` directory:
```bash
cd /home/gmartin/dev/ircommandcenter/frontend
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder tiptap-markdown
```

- [ ] **Step 2: Verify install**

```bash
grep -E "@tiptap|tiptap-markdown" /home/gmartin/dev/ircommandcenter/frontend/package.json
```

Expected output includes all four packages under `dependencies`.

- [ ] **Step 3: Commit**

```bash
cd /home/gmartin/dev/ircommandcenter
git add frontend/package.json frontend/package-lock.json
git commit -m "feat: install tiptap rich text editor dependencies"
```

---

### Task 2: Create Skeleton Component

**Files:**
- Create: `frontend/src/components/ui/Skeleton.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/ui/Skeleton.tsx
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
```

- [ ] **Step 2: Verify it renders**

Start the dev stack and import `Skeleton` in any page temporarily to confirm it renders a pulsing gray block. Then remove the temporary import.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/Skeleton.tsx
git commit -m "feat: add Skeleton UI primitive"
```

---

### Task 3: Create EmptyState Component

**Files:**
- Create: `frontend/src/components/ui/EmptyState.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/ui/EmptyState.tsx
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center px-4", className)}>
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground shrink-0">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ui/EmptyState.tsx
git commit -m "feat: add EmptyState UI primitive"
```

---

### Task 4: Apply Skeleton Loaders to Incidents List Page

**Files:**
- Modify: `frontend/src/app/(dashboard)/incidents/page.tsx`

- [ ] **Step 1: Add skeleton import and loading state**

Find the loading state in `frontend/src/app/(dashboard)/incidents/page.tsx`. Currently `isLoading` from `useQuery` controls a spinner. Replace the spinner with skeleton rows.

Add import at the top of the file:
```tsx
import { Skeleton } from "@/components/ui/Skeleton";
```

Find this block (around line 72):
```tsx
if (isLoading) {
  return <div className="flex justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
}
```

If the file doesn't have an explicit loading block (it renders based on `incidents` array being empty), find the `return (` statement for the main render and wrap the table/list area. Locate where incidents are rendered in a list (look for `filtered.map(...)`) and add this before it:

Replace whatever loading indicator exists with:
```tsx
{isLoading && (
  <div className="space-y-2">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
        <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 2: Verify in browser**

Navigate to `/incidents` — on first load you should see 6 pulsing skeleton rows before data appears. Add `staleTime: 0` temporarily to force a reload on each visit to test.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/incidents/page.tsx
git commit -m "feat: skeleton loaders on incidents list"
```

---

### Task 5: Apply Skeleton Loaders to Dashboard Page

**Files:**
- Modify: `frontend/src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Add skeleton import**

Add to imports in `frontend/src/app/(dashboard)/page.tsx`:
```tsx
import { Skeleton } from "@/components/ui/Skeleton";
```

- [ ] **Step 2: Replace stat card loading state**

Find the stat cards section (the `<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">` around line 93). Wrap the cards to show skeletons while `summary` is undefined:

```tsx
{/* Stat cards */}
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  {!summary ? (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <Skeleton className="h-5 w-5 mb-3 rounded" />
          <Skeleton className="h-8 w-16 mb-2" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </>
  ) : (
    <>
      <StatCard label="Open Incidents" value={summary.open_count} ... />
      {/* rest of stat cards unchanged */}
    </>
  )}
</div>
```

- [ ] **Step 3: Replace chart loading states**

In the "Charts row" section, replace the `trends?.points` check with a skeleton while data is loading:

```tsx
{/* Incident volume trends */}
<div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-sm font-semibold text-foreground">Incident Volume — Last 8 Weeks</h2>
    ...
  </div>
  {!trends ? (
    <Skeleton className="h-44 w-full rounded-lg" />
  ) : trends.points && trends.points.some(...) ? (
    <ResponsiveContainer ...>
      ...
    </ResponsiveContainer>
  ) : (
    <div className="flex items-center justify-center h-40">
      <p className="text-sm text-muted-foreground">Not enough data yet</p>
    </div>
  )}
</div>
```

Apply the same pattern to "Open by Severity" and "Task Backlog by Owner" charts.

- [ ] **Step 4: Verify in browser**

Navigate to `/` — charts and stat cards should show skeletons before data loads.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(dashboard\)/page.tsx
git commit -m "feat: skeleton loaders on dashboard"
```

---

### Task 6: Apply Skeleton Loaders to War Room Page

**Files:**
- Modify: `frontend/src/app/(dashboard)/incidents/[id]/page.tsx`

- [ ] **Step 1: Add skeleton import**

Add to imports:
```tsx
import { Skeleton } from "@/components/ui/Skeleton";
```

- [ ] **Step 2: Replace the loading spinner**

Find this block (around line 153):
```tsx
if (isLoading || !incident) {
  return <div className="flex justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
}
```

Replace with:
```tsx
if (isLoading || !incident) {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-20 rounded shrink-0" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="px-4 py-3 flex items-start gap-2">
                  <Skeleton className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Navigate to an incident — on first load you should see the structured skeleton layout.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(dashboard\)/incidents/\[id\]/page.tsx
git commit -m "feat: skeleton loader on war room page"
```

---

### Task 7: Apply EmptyState to Incidents List, War Room Panels, and Remaining Pages

**Files:**
- Modify: `frontend/src/app/(dashboard)/incidents/page.tsx`
- Modify: `frontend/src/app/(dashboard)/incidents/[id]/page.tsx`
- Modify: `frontend/src/app/(dashboard)/vendors/page.tsx`
- Modify: `frontend/src/app/(dashboard)/contacts/page.tsx`
- Modify: `frontend/src/app/(dashboard)/playbooks/page.tsx`

- [ ] **Step 1: Apply EmptyState to Incidents list**

Add import to `frontend/src/app/(dashboard)/incidents/page.tsx`:
```tsx
import { EmptyState } from "@/components/ui/EmptyState";
```

Find the empty case in the filtered list render. It currently shows something like `"No incidents found"`. Replace it with:
```tsx
{!isLoading && filtered.length === 0 && (
  <EmptyState
    icon={<AlertTriangle className="h-6 w-6" />}
    title={incidents.length === 0 ? "No incidents yet" : "No matching incidents"}
    description={incidents.length === 0 ? "When something goes wrong, declare an incident to start coordinating your response." : "Try adjusting your search or filters."}
    action={incidents.length === 0 && canAnalyst ? (
      <a href="/incidents/new" className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
        <Plus className="h-4 w-4" /> Declare Incident
      </a>
    ) : undefined}
  />
)}
```

- [ ] **Step 2: Apply EmptyState to War Room IOC, asset, and notes panels**

Add import to `frontend/src/app/(dashboard)/incidents/[id]/page.tsx`:
```tsx
import { EmptyState } from "@/components/ui/EmptyState";
```

Find the IOC empty state (currently `<p className="text-xs text-muted-foreground text-center py-6">No IOCs documented</p>`). Replace with:
```tsx
<EmptyState
  icon={<Shield className="h-5 w-5" />}
  title="No IOCs documented"
  description="Add indicators of compromise as you discover them."
  className="py-8"
  action={canAnalyst ? (
    <button onClick={() => setAddIOC({ ...addIOC, show: true })} className="text-xs text-primary hover:underline">
      + Add IOC
    </button>
  ) : undefined}
/>
```

Find the assets empty state (`No assets documented`). Replace with:
```tsx
<EmptyState
  icon={<Server className="h-5 w-5" />}
  title="No assets documented"
  description="Track which systems and infrastructure are affected."
  className="py-8"
  action={canAnalyst ? (
    <button onClick={() => setAddAsset({ ...addAsset, show: true })} className="text-xs text-primary hover:underline">
      + Add Asset
    </button>
  ) : undefined}
/>
```

You'll need to add `Server` to the lucide-react import. Find the notes empty state (`No notes yet`). Replace with:
```tsx
<EmptyState
  icon={<FileText className="h-5 w-5" />}
  title="No notes yet"
  description="Document findings, decisions, and updates."
  className="py-8"
  action={canAnalyst ? (
    <button onClick={() => setAddNote({ show: true, content: "" })} className="text-xs text-primary hover:underline">
      + Add Note
    </button>
  ) : undefined}
/>
```

- [ ] **Step 3: Apply EmptyState to Vendors page**

Add imports to `frontend/src/app/(dashboard)/vendors/page.tsx`:
```tsx
import { EmptyState } from "@/components/ui/EmptyState";
```

Find the empty vendors list render and replace with:
```tsx
{!isLoading && filtered.length === 0 && (
  <EmptyState
    icon={<Building2 className="h-6 w-6" />}
    title={vendors.length === 0 ? "No vendors registered" : "No matching vendors"}
    description={vendors.length === 0 ? "Add your IR retainer firms, legal counsel, insurance carriers, and other key vendors." : "Try adjusting your search or type filter."}
    action={vendors.length === 0 ? (
      <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
        <Plus className="h-4 w-4" /> Add Vendor
      </button>
    ) : undefined}
  />
)}
```

- [ ] **Step 4: Apply EmptyState to Contacts page**

Add imports to `frontend/src/app/(dashboard)/contacts/page.tsx`:
```tsx
import { EmptyState } from "@/components/ui/EmptyState";
```

Find the empty contacts render and replace with:
```tsx
{!isLoading && filtered.length === 0 && (
  <EmptyState
    icon={<PhoneCall className="h-6 w-6" />}
    title={contacts.length === 0 ? "No contacts added" : "No matching contacts"}
    description={contacts.length === 0 ? "Add your emergency contacts, legal counsel, insurance, and exec team members." : "Try adjusting your search or category filter."}
    action={contacts.length === 0 ? (
      <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
        <Plus className="h-4 w-4" /> Add Contact
      </button>
    ) : undefined}
  />
)}
```

- [ ] **Step 5: Apply EmptyState to Playbooks page**

Add imports to `frontend/src/app/(dashboard)/playbooks/page.tsx`:
```tsx
import { EmptyState } from "@/components/ui/EmptyState";
```

Find the empty playbooks render and replace with:
```tsx
{!isLoading && filtered.length === 0 && (
  <EmptyState
    icon={<BookMarked className="h-6 w-6" />}
    title={playbooks.length === 0 ? "No playbooks yet" : "No matching playbooks"}
    description={playbooks.length === 0 ? "Create step-by-step response procedures for different incident types." : "Try adjusting your search or type filter."}
    action={canWrite && playbooks.length === 0 ? (
      <button onClick={() => setEditing({ title: "", incident_type: "RANSOMWARE", description: "", is_active: true, steps: [] })} className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
        <Plus className="h-4 w-4" /> New Playbook
      </button>
    ) : undefined}
  />
)}
```

- [ ] **Step 6: Verify in browser**

Visit each page with no data — empty states should show contextual icons, titles, descriptions, and action buttons.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/\(dashboard\)/incidents/page.tsx \
        frontend/src/app/\(dashboard\)/incidents/\[id\]/page.tsx \
        frontend/src/app/\(dashboard\)/vendors/page.tsx \
        frontend/src/app/\(dashboard\)/contacts/page.tsx \
        frontend/src/app/\(dashboard\)/playbooks/page.tsx
git commit -m "feat: consistent empty states across incidents, war room, vendors, contacts, playbooks"
```

---

### Task 8: Create RichTextEditor Component

**Files:**
- Create: `frontend/src/components/RichTextEditor.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/RichTextEditor.tsx
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { Bold, Italic, List, ListOrdered, Code, Heading2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  disabled?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = "100px",
  disabled = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.storage.markdown.getMarkdown());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2 text-sm text-foreground",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.storage.markdown.getMarkdown();
    if (current !== value) {
      editor.commands.setContent(value ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  return (
    <div
      className={cn(
        "border border-border rounded-lg bg-background overflow-hidden",
        disabled && "opacity-60 pointer-events-none",
        className
      )}
    >
      {!disabled && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30">
          <Btn onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive("bold")} title="Bold">
            <Bold className="h-3.5 w-3.5" />
          </Btn>
          <Btn onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive("italic")} title="Italic">
            <Italic className="h-3.5 w-3.5" />
          </Btn>
          <Btn onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive("heading", { level: 2 })} title="Heading">
            <Heading2 className="h-3.5 w-3.5" />
          </Btn>
          <Btn onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive("bulletList")} title="Bullet list">
            <List className="h-3.5 w-3.5" />
          </Btn>
          <Btn onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive("orderedList")} title="Numbered list">
            <ListOrdered className="h-3.5 w-3.5" />
          </Btn>
          <Btn onClick={() => editor?.chain().focus().toggleCode().run()} active={editor?.isActive("code")} title="Inline code">
            <Code className="h-3.5 w-3.5" />
          </Btn>
        </div>
      )}
      <div
        style={{ minHeight }}
        className="cursor-text"
        onClick={() => editor?.commands.focus()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Btn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean | null;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1 rounded transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}
```

Add the Tiptap placeholder CSS to `frontend/src/app/globals.css`:
```css
/* Tiptap placeholder */
.tiptap p.is-editor-empty:first-child::before {
  color: hsl(var(--muted-foreground));
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
```

- [ ] **Step 2: Verify in browser**

Temporarily use `<RichTextEditor value="" onChange={() => {}} placeholder="Test placeholder" />` in any page to confirm it renders with toolbar, placeholder text, and that typing works. Remove temporary usage.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/RichTextEditor.tsx frontend/src/app/globals.css
git commit -m "feat: add RichTextEditor component (Tiptap + markdown)"
```

---

### Task 9: Replace War Room Notes Textarea with RichTextEditor

**Files:**
- Modify: `frontend/src/app/(dashboard)/incidents/[id]/page.tsx`

- [ ] **Step 1: Add RichTextEditor import**

Add to imports at the top of `frontend/src/app/(dashboard)/incidents/[id]/page.tsx`:
```tsx
import { RichTextEditor } from "@/components/RichTextEditor";
```

- [ ] **Step 2: Replace the textarea in the "Add Note" form**

Find this block:
```tsx
<textarea
  value={addNote.content}
  onChange={(e) => setAddNote({ ...addNote, content: e.target.value })}
  placeholder="Add a note... (supports markdown)"
  rows={3}
  className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background resize-none"
/>
```

Replace with:
```tsx
<RichTextEditor
  value={addNote.content}
  onChange={(val) => setAddNote({ ...addNote, content: val })}
  placeholder="Add a note… (bold, lists, code supported)"
  minHeight="80px"
  className="text-xs"
/>
```

- [ ] **Step 3: Verify in browser**

Open any incident → War Room tab → click `+ Add` on Notes. The textarea should now be a rich text editor with toolbar. Type some text, apply bold, and add a note. Confirm the note content saves and displays correctly (with `whitespace-pre-wrap`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(dashboard\)/incidents/\[id\]/page.tsx
git commit -m "feat: rich text editor for war room notes"
```

---

### Task 10: Replace Documents Editor Textarea with RichTextEditor

**Files:**
- Modify: `frontend/src/app/(dashboard)/documents/page.tsx`

- [ ] **Step 1: Add RichTextEditor import**

Add to imports at the top of `frontend/src/app/(dashboard)/documents/page.tsx`:
```tsx
import { RichTextEditor } from "@/components/RichTextEditor";
```

- [ ] **Step 2: Replace the "new document" content textarea**

Find this block (around line 176):
```tsx
<textarea
  value={newDoc.content}
  onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })}
  rows={20}
  placeholder="Document content (Markdown supported)..."
  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-none"
/>
```

Replace with:
```tsx
<RichTextEditor
  value={newDoc.content}
  onChange={(val) => setNewDoc({ ...newDoc, content: val })}
  placeholder="Document content… (bold, headings, lists, code supported)"
  minHeight="400px"
/>
```

- [ ] **Step 3: Replace the "edit existing document" textarea**

Find this block (around line 246):
```tsx
<textarea
  value={selected.content ?? ""}
  onChange={(e) => setSelected({ ...selected, content: e.target.value })}
  rows={24}
  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-none"
/>
```

Replace with:
```tsx
<RichTextEditor
  value={selected.content ?? ""}
  onChange={(val) => setSelected({ ...selected, content: val })}
  placeholder="Write document content…"
  minHeight="500px"
/>
```

Since the editor is now WYSIWYG, also remove the `previewMode` toggle button and state from the selected document header — the editor IS the preview:

Remove the `previewMode` state and the "Preview" / "Edit" toggle button. Remove the `previewMode ? <MarkdownViewer ...> : <textarea ...>` conditional — just render `<RichTextEditor>` always. Keep the `MarkdownViewer` for `is_system_template` documents (those are read-only).

- [ ] **Step 4: Verify in browser**

Go to `/documents` → create a new document. The content area should be a rich text editor. Open an existing document — the editor should load with existing content and the toolbar should work.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(dashboard\)/documents/page.tsx
git commit -m "feat: rich text editor for document library"
```

---

### Task 11: Replace IR Plan Textarea with RichTextEditor

**Files:**
- Modify: `frontend/src/app/(dashboard)/ir-plan/page.tsx`

- [ ] **Step 1: Add RichTextEditor import**

Add to imports at the top of `frontend/src/app/(dashboard)/ir-plan/page.tsx`:
```tsx
import { RichTextEditor } from "@/components/RichTextEditor";
```

- [ ] **Step 2: Find the SectionEditor component's textarea**

The IR Plan page has a `SectionEditor` inner component (or section editing function) with a `<textarea>` for editing markdown content. Find this block (around line 163):
```tsx
<textarea
  value={content}
  onChange={(e) => { setContent(e.target.value); setDirty(true); }}
  className="flex-1 resize-none px-8 py-6 text-sm font-mono bg-background focus:outline-none leading-relaxed"
  placeholder="Write this section in Markdown…"
  spellCheck={false}
/>
```

Replace with:
```tsx
<div className="flex-1 overflow-y-auto">
  <RichTextEditor
    value={content}
    onChange={(val) => { setContent(val); setDirty(true); }}
    placeholder="Write this section in Markdown…"
    minHeight="400px"
    className="border-0 rounded-none"
  />
</div>
```

Since the RichTextEditor is WYSIWYG, also remove the `preview` state and the "Preview / Edit" toggle button from the section editor — the rich text editor serves as both. Remove the `{preview ? <MarkdownPreview> : <textarea>}` conditional and render just the `<RichTextEditor>`. Also remove the `MarkdownPreview` function from the file since it's no longer used.

Keep the "Mark Reviewed" and "Save" buttons. Update the footer to remove "Markdown supported" since it's now rich text.

- [ ] **Step 3: Verify in browser**

Go to `/ir-plan` → click a section to edit. The rich text editor should render. Type content, apply heading formatting, and save. Confirm the saved content displays correctly when you revisit.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(dashboard\)/ir-plan/page.tsx
git commit -m "feat: rich text editor for IR plan section editor"
```

---

### Task 12: Replace PostMortem EditableSection Textarea with RichTextEditor

**Files:**
- Modify: `frontend/src/app/(dashboard)/incidents/[id]/postmortem/page.tsx`

- [ ] **Step 1: Add RichTextEditor import**

Add to imports:
```tsx
import { RichTextEditor } from "@/components/RichTextEditor";
```

- [ ] **Step 2: Replace the textarea inside EditableSection**

Find the `EditableSection` component inside the file. It renders a `<textarea>` when `editing` is true (around line 69):
```tsx
<textarea
  value={draft}
  onChange={(e) => setDraft(e.target.value)}
  rows={rows}
  autoFocus
  className="w-full px-3 py-2 text-sm border border-primary rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
/>
```

Replace with:
```tsx
<RichTextEditor
  value={draft}
  onChange={setDraft}
  placeholder={placeholder}
  minHeight={`${(rows ?? 4) * 28}px`}
/>
```

Update the `EditableTextareaProps` interface to remove the `rows` prop if no longer needed, or keep it as an optional hint for minHeight.

- [ ] **Step 3: Verify in browser**

Open an incident → Post-Mortem tab → click the edit pencil on any section (Summary, Impact, Root Cause, etc.). The rich text editor should render. Edit content and save.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(dashboard\)/incidents/\[id\]/postmortem/page.tsx
git commit -m "feat: rich text editor for post-mortem sections"
```

---

### Task 13: Replace Playbook Step Description Textarea with RichTextEditor

**Files:**
- Modify: `frontend/src/app/(dashboard)/playbooks/page.tsx`

- [ ] **Step 1: Add RichTextEditor import**

Add to imports:
```tsx
import { RichTextEditor } from "@/components/RichTextEditor";
```

- [ ] **Step 2: Replace the playbook description textarea**

Find around line 324:
```tsx
<textarea
  value={description}
  onChange={(e) => setDescription(e.target.value)}
  rows={4}
  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
  placeholder="What this playbook covers…"
/>
```

Replace with:
```tsx
<RichTextEditor
  value={description}
  onChange={setDescription}
  placeholder="What this playbook covers…"
  minHeight="100px"
/>
```

- [ ] **Step 3: Replace the step description textarea**

Find around line 403:
```tsx
<textarea
  value={step.description ?? ""}
  onChange={(e) => updateStep(step.id, { description: e.target.value || null })}
  rows={3}
  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
  placeholder="What to do in this step…"
/>
```

Replace with:
```tsx
<RichTextEditor
  value={step.description ?? ""}
  onChange={(val) => updateStep(step.id, { description: val || null })}
  placeholder="What to do in this step…"
  minHeight="80px"
/>
```

- [ ] **Step 4: Verify in browser**

Go to `/playbooks` → create or edit a playbook. Both the playbook description and step description fields should now be rich text editors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(dashboard\)/playbooks/page.tsx
git commit -m "feat: rich text editor for playbook descriptions and steps"
```

---

### Task 14: Upgrade GlobalSearch to Command Palette

**Files:**
- Modify: `frontend/src/components/GlobalSearch.tsx`

- [ ] **Step 1: Replace the GlobalSearch component**

Replace the entire contents of `frontend/src/components/GlobalSearch.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, AlertTriangle, Shield, CheckSquare, FileText,
  MessageSquare, X, Plus, BookMarked, ScrollText,
  PhoneCall, BookOpen, Building2, BarChart3, ArrowRight,
} from "lucide-react";
import api from "@/lib/api";
import type { SearchResult } from "@/lib/types";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  incident: <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
  ioc: <Shield className="h-3.5 w-3.5 text-orange-500" />,
  task: <CheckSquare className="h-3.5 w-3.5 text-blue-500" />,
  document: <FileText className="h-3.5 w-3.5 text-purple-500" />,
  comms: <MessageSquare className="h-3.5 w-3.5 text-green-500" />,
};

const TYPE_LABELS: Record<string, string> = {
  incident: "Incident",
  ioc: "IOC",
  task: "Task",
  document: "Document",
  comms: "Comms",
};

interface NavAction {
  label: string;
  href: string;
  icon: React.ReactNode;
  description?: string;
}

const NAV_ACTIONS: NavAction[] = [
  { label: "Declare Incident", href: "/incidents/new", icon: <Plus className="h-3.5 w-3.5 text-red-500" />, description: "Start a new incident response" },
  { label: "Incidents", href: "/incidents", icon: <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />, description: "View all incidents" },
  { label: "Task Board", href: "/tasks", icon: <CheckSquare className="h-3.5 w-3.5 text-blue-500" />, description: "Org-wide task kanban" },
  { label: "Playbooks", href: "/playbooks", icon: <BookMarked className="h-3.5 w-3.5 text-purple-500" />, description: "Response playbooks" },
  { label: "IR Plan", href: "/ir-plan", icon: <ScrollText className="h-3.5 w-3.5 text-green-500" />, description: "Living IR plan sections" },
  { label: "Contact Directory", href: "/contacts", icon: <PhoneCall className="h-3.5 w-3.5 text-cyan-500" />, description: "Emergency contacts" },
  { label: "Knowledge Base", href: "/knowledge", icon: <BookOpen className="h-3.5 w-3.5 text-yellow-500" />, description: "Org knowledge context" },
  { label: "Vendors", href: "/vendors", icon: <Building2 className="h-3.5 w-3.5 text-indigo-500" />, description: "Vendor registry" },
  { label: "Analytics", href: "/analytics", icon: <BarChart3 className="h-3.5 w-3.5 text-teal-500" />, description: "Operational and strategic analytics" },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const router = useRouter();

  const openSearch = useCallback(() => {
    setOpen(true);
    setSelected(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setSelected(0);
  }, []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        open ? closeSearch() : openSearch();
      }
      if (e.key === "Escape" && open) closeSearch();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, openSearch, closeSearch]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(query)}`);
        setResults(res.data.results);
        setSelected(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  const activeItems = query.trim() ? results : NAV_ACTIONS;
  const totalItems = activeItems.length;

  function navigate(href: string) {
    router.push(href);
    closeSearch();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, totalItems - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter") {
      if (query.trim() && results[selected]) navigate(results[selected].href);
      else if (!query.trim() && NAV_ACTIONS[selected]) navigate(NAV_ACTIONS[selected].href);
    }
  }

  return (
    <>
      <button
        onClick={openSearch}
        className="p-1.5 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        aria-label="Command palette (⌘K)"
        title="Command palette (⌘K)"
      >
        <Search className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/40" onClick={closeSearch}>
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search incidents, IOCs, tasks, or navigate…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {query && (
                <button onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}>
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
              <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-xs font-mono text-muted-foreground border border-border rounded">Esc</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {/* Empty query: show navigation actions */}
              {!query && (
                <>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Quick Navigation</p>
                  {NAV_ACTIONS.map((action, i) => (
                    <button
                      key={action.href}
                      onClick={() => navigate(action.href)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors ${i === selected ? "bg-muted/50" : ""}`}
                    >
                      <span className="shrink-0">{action.icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">{action.label}</span>
                        {action.description && <p className="text-xs text-muted-foreground">{action.description}</p>}
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100" />
                    </button>
                  ))}
                </>
              )}

              {/* Search results */}
              {query && loading && (
                <p className="px-4 py-4 text-sm text-muted-foreground text-center">Searching…</p>
              )}
              {query && !loading && results.length === 0 && (
                <p className="px-4 py-4 text-sm text-muted-foreground text-center">No results for &quot;{query}&quot;</p>
              )}
              {query && !loading && results.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => navigate(r.href)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border last:border-0 ${i === selected ? "bg-muted/50" : ""}`}
                >
                  <span className="mt-0.5 shrink-0">{TYPE_ICONS[r.type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{r.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {TYPE_LABELS[r.type] ?? r.type}
                      </span>
                    </div>
                    {r.snippet && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.snippet}</p>}
                  </div>
                </button>
              ))}
            </div>

            <div className="px-4 py-2 border-t border-border flex items-center gap-3 text-xs text-muted-foreground">
              <span><kbd className="font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono">↵</kbd> open</span>
              <span><kbd className="font-mono">Esc</kbd> close</span>
              <span className="ml-auto"><kbd className="font-mono">⌘K</kbd> toggle</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify in browser**

Press `Cmd+K` — the palette should open showing 9 navigation shortcuts. Start typing — it should switch to live search results. Arrow keys should navigate, Enter should navigate.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/GlobalSearch.tsx
git commit -m "feat: upgrade global search to command palette with nav actions"
```

---

### Task 15: Create OnboardingChecklist Component

**Files:**
- Create: `frontend/src/components/OnboardingChecklist.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/OnboardingChecklist.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

const STORAGE_KEY = "ircc_onboarding_dismissed";

interface CheckItem {
  id: string;
  label: string;
  href: string;
  description: string;
}

const CHECKLIST: CheckItem[] = [
  { id: "ai",       label: "Configure an AI provider",  href: "/ai-config",  description: "Enable AI-powered briefings, task generation, and analysis" },
  { id: "knowledge",label: "Add org knowledge",          href: "/knowledge",  description: "Your org context makes AI outputs more accurate" },
  { id: "playbook", label: "Create a playbook",          href: "/playbooks",  description: "Step-by-step response procedures for common incident types" },
  { id: "contacts", label: "Add emergency contacts",     href: "/contacts",   description: "Who to call when things go wrong" },
  { id: "irplan",   label: "Review your IR Plan",        href: "/ir-plan",    description: "Document your org's response procedures and review schedule" },
];

export function OnboardingChecklist() {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  const { data: aiConfig } = useQuery({
    queryKey: ["ai-config-check"],
    queryFn: () => api.get("/ai/config").then((r) => r.data).catch(() => null),
    staleTime: 60_000,
  });
  const { data: knowledge } = useQuery({
    queryKey: ["knowledge-check"],
    queryFn: () => api.get("/knowledge").then((r) => r.data).catch(() => null),
    staleTime: 60_000,
  });
  const { data: playbooks = [] } = useQuery({
    queryKey: ["playbooks-check"],
    queryFn: () => api.get("/playbooks").then((r) => r.data as unknown[]).catch(() => []),
    staleTime: 60_000,
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-check"],
    queryFn: () => api.get("/contacts").then((r) => r.data as unknown[]).catch(() => []),
    staleTime: 60_000,
  });
  const { data: irplan = [] } = useQuery({
    queryKey: ["irplan-check"],
    queryFn: () => api.get("/irplan/sections").then((r) => r.data as Array<{ content: string | null }>).catch(() => []),
    staleTime: 60_000,
  });

  const completedIds = new Set<string>();
  if (aiConfig && Object.values((aiConfig as { providers?: Record<string, { configured: boolean }> }).providers ?? {}).some((p) => p.configured)) {
    completedIds.add("ai");
  }
  if ((knowledge as { org_name?: string | null } | null)?.org_name) completedIds.add("knowledge");
  if (Array.isArray(playbooks) && playbooks.length > 0) completedIds.add("playbook");
  if (Array.isArray(contacts) && contacts.length > 0) completedIds.add("contacts");
  if (Array.isArray(irplan) && irplan.some((s) => s.content && s.content.trim().length > 20)) completedIds.add("irplan");

  const allDone = CHECKLIST.every((item) => completedIds.has(item.id));

  if (dismissed === null || dismissed || allDone) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  }

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Get started with IR Command Center</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Complete these steps to get the most out of the platform
          </p>
        </div>
        <button
          onClick={dismiss}
          className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1">
        {CHECKLIST.map((item) => {
          const done = completedIds.has(item.id);
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                done ? "opacity-60 cursor-default" : "hover:bg-blue-100/60 dark:hover:bg-blue-900/20"
              }`}
              onClick={done ? (e) => e.preventDefault() : undefined}
            >
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {item.label}
                </p>
                {!done && (
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                )}
              </div>
              {!done && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
            </Link>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-blue-200 dark:border-blue-900">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-blue-200 dark:bg-blue-900 rounded-full overflow-hidden">
            <div
              className="h-1.5 bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${(completedIds.size / CHECKLIST.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {completedIds.size}/{CHECKLIST.length}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/OnboardingChecklist.tsx
git commit -m "feat: add OnboardingChecklist component"
```

---

### Task 16: Add OnboardingChecklist to Dashboard Homepage

**Files:**
- Modify: `frontend/src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Add import**

Add to imports at the top of `frontend/src/app/(dashboard)/page.tsx`:
```tsx
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
```

- [ ] **Step 2: Render checklist below the greeting header**

Find the greeting/header section (around line 81):
```tsx
{/* Header */}
<div>
  <h1 className="text-2xl font-bold text-foreground tracking-tight">
    Good {greeting}, {user?.name?.split(" ")[0] ?? user?.email.split("@")[0]}
  </h1>
  <p className="text-muted-foreground mt-1 text-sm">
    ...
  </p>
</div>
```

Add `<OnboardingChecklist />` immediately after the closing `</div>` of the header section:
```tsx
{/* Onboarding checklist (dismissible, hides when complete) */}
<OnboardingChecklist />
```

- [ ] **Step 3: Verify in browser**

Navigate to `/` — the checklist should appear between the greeting and the stat cards. Check off items by configuring each feature. Click X to dismiss. Confirm localStorage persists the dismissal on reload.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(dashboard\)/page.tsx
git commit -m "feat: onboarding checklist on dashboard homepage"
```

---

### Task 17: Design Consistency Pass

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add consistent focus ring, input, and animation utilities**

Add to the end of `frontend/src/app/globals.css`:
```css
/* ============================================================
   Design System Consistency Utilities
   ============================================================ */

/* Consistent input focus ring — applied globally */
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid hsl(var(--primary) / 0.4);
  outline-offset: 0;
}

/* Fade-in animation (used on page-level containers) */
@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fade-in 0.18s ease-out;
}

/* Consistent card hover lift */
.card-hover {
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}
.card-hover:hover {
  box-shadow: 0 4px 12px hsl(var(--foreground) / 0.06);
  border-color: hsl(var(--border) / 0.8);
}
```

- [ ] **Step 2: Verify animate-fade-in is applied**

Check that `animate-fade-in` is already used on page containers (search for it in the codebase). If some pages don't have it, add `className="... animate-fade-in"` to their top-level `<div>`.

```bash
grep -r "animate-fade-in" /home/gmartin/dev/ircommandcenter/frontend/src/app --include="*.tsx" | wc -l
```

Any page with `p-6 max-w-7xl mx-auto` as its root container should also have `animate-fade-in`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "feat: design consistency pass — focus rings, fade-in, card hover"
```
