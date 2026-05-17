"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth, hasRole } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import type { Vendor, VendorType } from "@/lib/types";
import { toast } from "sonner";
import { Building2, Phone, Mail, Clock, AlertTriangle, Plus, Pencil, Trash2, X } from "lucide-react";

const TYPE_LABELS: Record<VendorType, string> = {
  LEGAL: "Legal",
  FORENSICS: "Forensics",
  PR: "PR / Communications",
  INSURANCE: "Insurance",
  RANSOM_NEGOTIATOR: "Ransom Negotiator",
  BREACH_COACH: "Breach Coach",
  OTHER: "Other",
};

const TYPE_COLORS: Record<VendorType, string> = {
  LEGAL: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  FORENSICS: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  PR: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  INSURANCE: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  RANSOM_NEGOTIATOR: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  BREACH_COACH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  OTHER: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

const EMPTY_FORM = {
  name: "",
  vendor_type: "LEGAL" as VendorType,
  sla_response_hours: "",
  primary_contact_name: "",
  primary_contact_phone: "",
  primary_contact_email: "",
  secondary_contact_name: "",
  secondary_contact_phone: "",
  secondary_contact_email: "",
  contract_start: "",
  contract_expiry: "",
  notes: "",
};

export default function VendorsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canWrite = hasRole(user, "IR_LEAD");

  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<Vendor | null>(null);
  const [typeFilter, setTypeFilter] = useState<VendorType | "">("");

  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: () => api.get<Vendor[]>("/vendors").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.post("/vendors", {
        ...data,
        sla_response_hours: data.sla_response_hours ? Number(data.sla_response_hours) : null,
        contract_start: data.contract_start || null,
        contract_expiry: data.contract_expiry || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setModal(null);
      setForm(EMPTY_FORM);
      toast.success("Vendor added");
    },
    onError: () => toast.error("Failed to save vendor"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof form }) =>
      api.patch(`/vendors/${id}`, {
        ...data,
        sla_response_hours: data.sla_response_hours ? Number(data.sla_response_hours) : null,
        contract_start: data.contract_start || null,
        contract_expiry: data.contract_expiry || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setModal(null);
      setEditing(null);
      toast.success("Vendor updated");
    },
    onError: () => toast.error("Failed to update vendor"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/vendors/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setConfirmDelete(null);
      toast.success("Vendor deleted");
    },
    onError: () => toast.error("Failed to delete vendor"),
  });

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setModal("add");
  }

  function openEdit(v: Vendor) {
    setEditing(v);
    setForm({
      name: v.name,
      vendor_type: v.vendor_type,
      sla_response_hours: v.sla_response_hours?.toString() ?? "",
      primary_contact_name: v.primary_contact_name ?? "",
      primary_contact_phone: v.primary_contact_phone ?? "",
      primary_contact_email: v.primary_contact_email ?? "",
      secondary_contact_name: v.secondary_contact_name ?? "",
      secondary_contact_phone: v.secondary_contact_phone ?? "",
      secondary_contact_email: v.secondary_contact_email ?? "",
      contract_start: v.contract_start ?? "",
      contract_expiry: v.contract_expiry ?? "",
      notes: v.notes ?? "",
    });
    setModal("edit");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (modal === "edit" && editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const filtered = vendors.filter((v) => !typeFilter || v.vendor_type === typeFilter);
  const grouped = Object.entries(TYPE_LABELS).reduce((acc, [type]) => {
    const group = filtered.filter((v) => v.vendor_type === type);
    if (group.length > 0) acc[type as VendorType] = group;
    return acc;
  }, {} as Record<VendorType, Vendor[]>);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Vendor Registry</h1>
          <p className="text-muted-foreground mt-1">IR retainers, legal counsel, forensics partners, and key vendors</p>
        </div>
        {canWrite && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium text-sm"
          >
            <Plus className="h-4 w-4" />
            Add Vendor
          </button>
        )}
      </div>

      {/* Type filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setTypeFilter("")}
          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${!typeFilter ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
        >
          All
        </button>
        {Object.entries(TYPE_LABELS).map(([type, label]) => (
          <button
            key={type}
            onClick={() => setTypeFilter(typeFilter === type ? "" : type as VendorType)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${typeFilter === type ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No vendors yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add your IR retainers, legal counsel, and forensics partners.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {(Object.entries(grouped) as [VendorType, Vendor[]][]).map(([type, group]) => (
            <div key={type}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {TYPE_LABELS[type]}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.map((v) => (
                  <VendorCard
                    key={v.id}
                    vendor={v}
                    canWrite={canWrite}
                    onEdit={() => openEdit(v)}
                    onDelete={() => setConfirmDelete(v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-xl my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-semibold text-lg">{modal === "add" ? "Add Vendor" : "Edit Vendor"}</h3>
              <button onClick={() => { setModal(null); setEditing(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Vendor Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Type *</label>
                  <select value={form.vendor_type} onChange={(e) => setForm({ ...form, vendor_type: e.target.value as VendorType })}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">SLA Response (hours)</label>
                  <input type="number" value={form.sla_response_hours} onChange={(e) => setForm({ ...form, sla_response_hours: e.target.value })}
                    placeholder="e.g. 4"
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Primary Contact</p>
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Name" value={form.primary_contact_name} onChange={(e) => setForm({ ...form, primary_contact_name: e.target.value })}
                    className="px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <input placeholder="Phone" value={form.primary_contact_phone} onChange={(e) => setForm({ ...form, primary_contact_phone: e.target.value })}
                    className="px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <input placeholder="Email" type="email" value={form.primary_contact_email} onChange={(e) => setForm({ ...form, primary_contact_email: e.target.value })}
                    className="col-span-2 px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Contract Start</label>
                  <input type="date" value={form.contract_start} onChange={(e) => setForm({ ...form, contract_start: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Contract Expiry</label>
                  <input type="date" value={form.contract_expiry} onChange={(e) => setForm({ ...form, contract_expiry: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50">
                  {modal === "add" ? "Add Vendor" : "Save Changes"}
                </button>
                <button type="button" onClick={() => { setModal(null); setEditing(null); }}
                  className="px-4 py-2.5 border border-border text-sm rounded-lg hover:bg-muted">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl border border-border p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-lg mb-2 text-red-600">Delete Vendor</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Remove <span className="font-medium text-foreground">{confirmDelete.name}</span> from the registry?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
              <button onClick={() => deleteMutation.mutate(confirmDelete.id)} disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VendorCard({
  vendor, canWrite, onEdit, onDelete,
}: {
  vendor: Vendor;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`rounded-xl border bg-card p-5 space-y-3 ${vendor.expiry_warning ? "border-orange-300 dark:border-orange-700" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{vendor.name}</p>
          <span className={`inline-flex mt-1 px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[vendor.vendor_type]}`}>
            {TYPE_LABELS[vendor.vendor_type]}
          </span>
        </div>
        {canWrite && (
          <div className="flex gap-1 shrink-0">
            <button onClick={onEdit} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="p-1.5 text-muted-foreground hover:text-red-500 rounded transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {vendor.sla_response_hours != null && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          SLA: {vendor.sla_response_hours}h response
        </div>
      )}

      {vendor.primary_contact_name && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Primary Contact</p>
          <p className="text-sm font-medium">{vendor.primary_contact_name}</p>
          {vendor.primary_contact_phone && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="h-3 w-3" />
              {vendor.primary_contact_phone}
            </div>
          )}
          {vendor.primary_contact_email && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="h-3 w-3" />
              <span className="truncate">{vendor.primary_contact_email}</span>
            </div>
          )}
        </div>
      )}

      {vendor.contract_expiry && (
        <div className={`flex items-center gap-1.5 text-xs rounded px-2 py-1 ${vendor.expiry_warning ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-muted text-muted-foreground"}`}>
          {vendor.expiry_warning && <AlertTriangle className="h-3 w-3 shrink-0" />}
          Contract expires {vendor.contract_expiry}
          {vendor.expiry_warning && " — renew soon"}
        </div>
      )}

      {vendor.notes && (
        <p className="text-xs text-muted-foreground line-clamp-2">{vendor.notes}</p>
      )}
    </div>
  );
}
