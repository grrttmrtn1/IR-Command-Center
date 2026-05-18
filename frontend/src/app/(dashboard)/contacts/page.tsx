"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth, hasRole } from "@/lib/auth";
import type { ContactList, ContactCategory, OnCallRoster, OnCallRosterEntry } from "@/lib/types";
import { toast } from "sonner";
import {
  Phone, Mail, Building2, Plus, Pencil, Trash2, X, Users,
  Shield, Calendar, Star, ChevronDown, ChevronRight,
} from "lucide-react";

const CATEGORY_LABELS: Record<ContactCategory, string> = {
  IR_TEAM: "IR Team",
  EXEC_TEAM: "Executive Team",
  LEGAL: "Legal Counsel",
  INSURANCE: "Cyber Insurance",
  FORENSICS: "Forensics Retainer",
  PR: "PR / Communications",
  LAW_ENFORCEMENT: "Law Enforcement",
  OTHER: "Other",
};

const CATEGORY_COLORS: Record<ContactCategory, string> = {
  IR_TEAM: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  EXEC_TEAM: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  LEGAL: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  INSURANCE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  FORENSICS: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  PR: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  LAW_ENFORCEMENT: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  OTHER: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

const CATEGORY_ORDER: ContactCategory[] = [
  "IR_TEAM", "EXEC_TEAM", "LEGAL", "INSURANCE", "FORENSICS", "PR", "LAW_ENFORCEMENT", "OTHER",
];

type ContactForm = {
  name: string;
  role: string;
  email: string;
  phone: string;
  secondary_phone: string;
  organization: string;
  type: "INTERNAL" | "EXTERNAL";
  category: ContactCategory;
  escalation_order: string;
  is_primary: boolean;
  notes: string;
};

const EMPTY_CONTACT_FORM: ContactForm = {
  name: "",
  role: "",
  email: "",
  phone: "",
  secondary_phone: "",
  organization: "",
  type: "EXTERNAL",
  category: "OTHER",
  escalation_order: "",
  is_primary: false,
  notes: "",
};

function ContactCard({ contact, onEdit, onDelete, canWrite }: {
  contact: ContactList;
  onEdit: () => void;
  onDelete: () => void;
  canWrite: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:border-border/80 transition-colors">
      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
        {contact.name[0]?.toUpperCase() ?? "?"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm">{contact.name}</span>
          {contact.is_primary && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
          {contact.escalation_order != null && (
            <span className="text-[10px] font-bold text-muted-foreground">#{contact.escalation_order}</span>
          )}
        </div>
        {contact.role && <p className="text-xs text-muted-foreground">{contact.role}</p>}
        {contact.organization && <p className="text-xs text-muted-foreground">{contact.organization}</p>}
        <div className="flex flex-wrap gap-3 mt-2">
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Phone className="h-3 w-3" /> {contact.phone}
            </a>
          )}
          {contact.secondary_phone && (
            <a href={`tel:${contact.secondary_phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Phone className="h-3 w-3" /> {contact.secondary_phone} <span className="text-[10px]">(alt)</span>
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Mail className="h-3 w-3" /> {contact.email}
            </a>
          )}
        </div>
        {contact.notes && <p className="text-xs text-muted-foreground mt-1.5 italic">{contact.notes}</p>}
      </div>
      {canWrite && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function RosterSection({ rosters, canWrite, qc }: {
  rosters: OnCallRoster[];
  canWrite: boolean;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingRoster, setEditingRoster] = useState<OnCallRoster | null>(null);
  const [rosterForm, setRosterForm] = useState({ name: "", description: "", entries: [] as Partial<OnCallRosterEntry>[] });

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post("/ir-plan/oncall", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["oncall-rosters"] }); setShowAdd(false); toast.success("Roster created"); },
    onError: () => toast.error("Failed to create roster"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => api.patch(`/ir-plan/oncall/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["oncall-rosters"] }); setEditingRoster(null); toast.success("Roster updated"); },
    onError: () => toast.error("Failed to update roster"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ir-plan/oncall/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["oncall-rosters"] }); toast.success("Roster deleted"); },
    onError: () => toast.error("Failed to delete roster"),
  });

  function addEntry() {
    setRosterForm((f) => ({ ...f, entries: [...f.entries, { order: f.entries.length + 1, name: "", role: "", phone: "", email: "" }] }));
  }

  function updateEntry(idx: number, patch: Partial<OnCallRosterEntry>) {
    setRosterForm((f) => ({ ...f, entries: f.entries.map((e, i) => i === idx ? { ...e, ...patch } : e) }));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Calendar className="h-4 w-4" /> On-Call Rosters
        </h2>
        {canWrite && (
          <button
            onClick={() => { setRosterForm({ name: "", description: "", entries: [] }); setShowAdd(true); }}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
          >
            <Plus className="h-3.5 w-3.5" /> New Roster
          </button>
        )}
      </div>

      {rosters.length === 0 && !showAdd && (
        <div className="text-center py-8 border-2 border-dashed border-border rounded-xl text-muted-foreground text-sm">
          No on-call rosters configured.
          {canWrite && <span className="ml-1 text-primary cursor-pointer" onClick={() => setShowAdd(true)}>Add one.</span>}
        </div>
      )}

      {rosters.map((roster) => (
        <div key={roster.id} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setExpanded(expanded === roster.id ? null : roster.id)} className="text-muted-foreground">
                {expanded === roster.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <span className="font-medium text-sm">{roster.name}</span>
              {!roster.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
              <span className="text-xs text-muted-foreground">· {roster.entries.length} contacts</span>
            </div>
            {canWrite && (
              <div className="flex items-center gap-1">
                <button onClick={() => { setEditingRoster(roster); setRosterForm({ name: roster.name, description: roster.description ?? "", entries: [...roster.entries] }); }}
                  className="p-1.5 text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => deleteMutation.mutate(roster.id)} className="p-1.5 text-muted-foreground hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          {expanded === roster.id && roster.entries.length > 0 && (
            <div className="border-t border-border divide-y divide-border/50">
              {[...roster.entries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((entry, idx) => (
                <div key={idx} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{entry.name}</span>
                    {entry.role && <span className="text-xs text-muted-foreground ml-1.5">— {entry.role}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {entry.phone && <a href={`tel:${entry.phone}`} className="hover:text-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{entry.phone}</a>}
                    {entry.email && <a href={`mailto:${entry.email}`} className="hover:text-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{entry.email}</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Add/Edit roster modal */}
      {(showAdd || editingRoster) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{editingRoster ? "Edit Roster" : "New On-Call Roster"}</h3>
              <button onClick={() => { setShowAdd(false); setEditingRoster(null); }}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 mb-4">
              <input value={rosterForm.name} onChange={(e) => setRosterForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Roster name (e.g. Primary IR Response Team)"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <input value={rosterForm.description} onChange={(e) => setRosterForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Escalation Order</span>
                <button onClick={addEntry} className="text-xs text-primary font-medium flex items-center gap-1"><Plus className="h-3 w-3" /> Add</button>
              </div>
              {rosterForm.entries.map((entry, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-2 p-3 bg-muted/30 rounded-lg">
                  <input value={entry.name ?? ""} onChange={(e) => updateEntry(idx, { name: e.target.value })} placeholder="Name"
                    className="px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 col-span-2" />
                  <input value={entry.role ?? ""} onChange={(e) => updateEntry(idx, { role: e.target.value })} placeholder="Role"
                    className="px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary/40" />
                  <input value={entry.phone ?? ""} onChange={(e) => updateEntry(idx, { phone: e.target.value })} placeholder="Phone"
                    className="px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary/40" />
                  <input value={entry.email ?? ""} onChange={(e) => updateEntry(idx, { email: e.target.value })} placeholder="Email"
                    className="px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 col-span-2" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowAdd(false); setEditingRoster(null); }} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">Cancel</button>
              <button
                onClick={() => {
                  const payload = { name: rosterForm.name, description: rosterForm.description || null, entries: rosterForm.entries.map((e, i) => ({ ...e, order: i + 1 })) };
                  if (editingRoster) updateMutation.mutate({ id: editingRoster.id, data: payload });
                  else createMutation.mutate(payload);
                }}
                disabled={!rosterForm.name.trim()}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {editingRoster ? "Update" : "Create"} Roster
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ContactsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canWrite = hasRole(user, "IR_LEAD");

  const [activeTab, setActiveTab] = useState<"directory" | "oncall">("directory");
  const [categoryFilter, setCategoryFilter] = useState<ContactCategory | "">("");
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactList | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_CONTACT_FORM);
  const [deleteTarget, setDeleteTarget] = useState<ContactList | null>(null);

  const { data: contacts = [], isLoading } = useQuery<ContactList[]>({
    queryKey: ["contacts"],
    queryFn: () => api.get<ContactList[]>("/knowledge/contacts").then((r) => r.data),
  });

  const { data: rosters = [] } = useQuery<OnCallRoster[]>({
    queryKey: ["oncall-rosters"],
    queryFn: () => api.get<OnCallRoster[]>("/ir-plan/oncall").then((r) => r.data),
  });

  type SavePayload = Omit<ContactForm, "escalation_order"> & { escalation_order: number | null };

  const saveMutation = useMutation({
    mutationFn: (data: SavePayload) =>
      editingContact
        ? api.patch(`/knowledge/contacts/${editingContact.id}`, data)
        : api.post("/knowledge/contacts", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setShowForm(false);
      setEditingContact(null);
      setForm(EMPTY_CONTACT_FORM);
      toast.success(editingContact ? "Contact updated" : "Contact added");
    },
    onError: () => toast.error("Failed to save contact"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/knowledge/contacts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setDeleteTarget(null);
      toast.success("Contact deleted");
    },
  });

  function openEdit(c: ContactList) {
    setEditingContact(c);
    setForm({
      name: c.name,
      role: c.role ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      secondary_phone: c.secondary_phone ?? "",
      organization: c.organization ?? "",
      type: (c.type as "INTERNAL" | "EXTERNAL") ?? "EXTERNAL",
      category: c.category ?? "OTHER",
      escalation_order: c.escalation_order?.toString() ?? "",
      is_primary: c.is_primary,
      notes: c.notes ?? "",
    });
    setShowForm(true);
  }

  function handleSave() {
    const { escalation_order: eoStr, ...rest } = form;
    const payload: SavePayload = {
      ...rest,
      escalation_order: eoStr ? parseInt(eoStr, 10) : null,
    };
    saveMutation.mutate(payload);
  }

  const filtered = categoryFilter ? contacts.filter((c) => c.category === categoryFilter) : contacts;

  const grouped = CATEGORY_ORDER.reduce<Record<string, ContactList[]>>((acc, cat) => {
    const items = filtered.filter((c) => c.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Contact Directory</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            IR team, escalation contacts, and external retainers — one place to call when an incident hits.
          </p>
        </div>
        {canWrite && activeTab === "directory" && (
          <button
            onClick={() => { setEditingContact(null); setForm(EMPTY_CONTACT_FORM); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Contact
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted/30 rounded-lg p-1 w-fit">
        {([["directory", "Contact Directory"], ["oncall", "On-Call Rosters"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "directory" && (
        <>
          {/* Category filter */}
          <div className="flex gap-2 flex-wrap mb-5">
            <button
              onClick={() => setCategoryFilter("")}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${!categoryFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              All ({contacts.length})
            </button>
            {CATEGORY_ORDER.filter((cat) => contacts.some((c) => c.category === cat)).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? "" : cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${categoryFilter === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                {CATEGORY_LABELS[cat]} ({contacts.filter((c) => c.category === cat).length})
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading contacts…</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-border rounded-xl">
              <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-40" />
              <p className="text-muted-foreground text-sm">No contacts found.</p>
              {canWrite && <button onClick={() => setShowForm(true)} className="mt-2 text-primary text-sm hover:underline">Add the first contact</button>}
            </div>
          ) : (
            <div className="space-y-6">
              {(Object.keys(grouped) as ContactCategory[]).map((cat) => (
                <div key={cat}>
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${CATEGORY_COLORS[cat]}`}>{CATEGORY_LABELS[cat]}</span>
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {grouped[cat].map((c) => (
                      <ContactCard key={c.id} contact={c} onEdit={() => openEdit(c)} onDelete={() => setDeleteTarget(c)} canWrite={canWrite} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "oncall" && (
        <RosterSection rosters={rosters} canWrite={canWrite} qc={qc} />
      )}

      {/* Contact form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{editingContact ? "Edit Contact" : "Add Contact"}</h3>
              <button onClick={() => { setShowForm(false); setEditingContact(null); }}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="Full name" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ContactCategory })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40">
                    {CATEGORY_ORDER.map((cat) => <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Escalation Order</label>
                  <input type="number" min="1" value={form.escalation_order} onChange={(e) => setForm({ ...form, escalation_order: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="1 = first to call" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Role / Title</label>
                  <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="e.g. CISO, Outside Counsel" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Organization</label>
                  <input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="Company / Firm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Primary Phone</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="+1 555-000-0000" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Secondary Phone</label>
                  <input value={form.secondary_phone} onChange={(e) => setForm({ ...form, secondary_phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="Cell / after-hours" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="contact@example.com" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" placeholder="Contract number, retainer details, SLA, hours…" />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} className="rounded" />
                    <span className="text-sm">Primary contact for this category</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => { setShowForm(false); setEditingContact(null); }} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">Cancel</button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || saveMutation.isPending}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saveMutation.isPending ? "Saving…" : editingContact ? "Update" : "Add Contact"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-2">Remove Contact?</h3>
            <p className="text-sm text-muted-foreground mb-4"><strong>{deleteTarget.name}</strong> will be removed from the directory.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">Cancel</button>
              <button onClick={() => deleteMutation.mutate(deleteTarget.id)} className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
