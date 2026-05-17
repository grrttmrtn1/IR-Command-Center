"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { OrgKnowledge, ContactList } from "@/lib/types";
import { toast } from "sonner";
import { Plus, Trash2, Building2, Users, Phone } from "lucide-react";

const INDUSTRIES = ["Financial Services", "Healthcare", "Technology", "Retail", "Energy", "Government", "Manufacturing", "Education", "Legal", "Other"];

export default function KnowledgePage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"org" | "contacts">("org");
  const [orgForm, setOrgForm] = useState<Partial<OrgKnowledge>>({
    org_name: "", industry: "", size: "", comm_voice: "", comm_guidelines: "",
    critical_systems: [], regulatory_obligations: [],
  });
  const [newSystem, setNewSystem] = useState("");
  const [newObligation, setNewObligation] = useState("");
  const [contactForm, setContactForm] = useState<{ name: string; role: string; email: string; phone: string; organization: string; type: "INTERNAL" | "EXTERNAL" | "VENDOR" }>({ name: "", role: "", email: "", phone: "", organization: "", type: "INTERNAL" });
  const [showContactForm, setShowContactForm] = useState(false);

  const { data: knowledge } = useQuery({
    queryKey: ["knowledge"],
    queryFn: () => api.get<OrgKnowledge>("/knowledge").then((r) => r.data),
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => api.get<ContactList[]>("/knowledge/contacts").then((r) => r.data),
  });

  useEffect(() => {
    if (knowledge) {
      setOrgForm({
        org_name: knowledge.org_name ?? "",
        industry: knowledge.industry ?? "",
        size: knowledge.size ?? "",
        comm_voice: knowledge.comm_voice ?? "",
        comm_guidelines: knowledge.comm_guidelines ?? "",
        critical_systems: knowledge.critical_systems ?? [],
        regulatory_obligations: knowledge.regulatory_obligations ?? [],
      });
    }
  }, [knowledge]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<OrgKnowledge>) => api.patch("/knowledge", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success("Organization knowledge saved");
    },
  });

  const addContactMutation = useMutation({
    mutationFn: (data: typeof contactForm) => api.post("/knowledge/contacts", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setContactForm({ name: "", role: "", email: "", phone: "", organization: "", type: "INTERNAL" });
      setShowContactForm(false);
      toast.success("Contact added");
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: (contactId: string) => api.delete(`/knowledge/contacts/${contactId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact removed");
    },
  });

  function addToList(field: "critical_systems" | "regulatory_obligations", value: string, setter: (v: string) => void) {
    if (!value.trim()) return;
    setOrgForm((prev) => ({ ...prev, [field]: [...(prev[field] ?? []), value.trim()] }));
    setter("");
  }

  function removeFromList(field: "critical_systems" | "regulatory_obligations", index: number) {
    setOrgForm((prev) => ({ ...prev, [field]: (prev[field] ?? []).filter((_, i) => i !== index) }));
  }

  const contactsByType = (type: string) => contacts.filter((c) => c.type === type);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Business Knowledge Base</h1>
          <p className="text-muted-foreground mt-1">Organization context used by AI features for tailored outputs</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-muted/30 rounded-lg p-1 w-fit">
        {(["org", "contacts"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${activeTab === tab ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {tab === "org" ? "Organization" : "Contacts"}
          </button>
        ))}
      </div>

      {activeTab === "org" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Organization Profile</h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Organization Name</label>
                <input
                  value={orgForm.org_name ?? ""}
                  onChange={(e) => setOrgForm({ ...orgForm, org_name: e.target.value })}
                  placeholder="Acme Corp"
                  className="w-full mt-1.5 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Industry</label>
                <select
                  value={orgForm.industry ?? ""}
                  onChange={(e) => setOrgForm({ ...orgForm, industry: e.target.value })}
                  className="w-full mt-1.5 px-3 py-2 text-sm border border-border rounded-lg bg-background"
                >
                  <option value="">Select industry...</option>
                  {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Organization Size</label>
                <select
                  value={orgForm.size ?? ""}
                  onChange={(e) => setOrgForm({ ...orgForm, size: e.target.value })}
                  className="w-full mt-1.5 px-3 py-2 text-sm border border-border rounded-lg bg-background"
                >
                  <option value="">Select size...</option>
                  <option value="1-50">1–50 employees</option>
                  <option value="51-250">51–250 employees</option>
                  <option value="251-1000">251–1,000 employees</option>
                  <option value="1001-5000">1,001–5,000 employees</option>
                  <option value="5000+">5,000+ employees</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Critical Systems</label>
              <p className="text-xs text-muted-foreground mb-2">Systems that, if compromised, would have severe business impact</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {(orgForm.critical_systems ?? []).map((s, i) => (
                  <span key={i} className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full">
                    {s}
                    <button onClick={() => removeFromList("critical_systems", i)} className="text-muted-foreground hover:text-red-500 ml-0.5">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newSystem}
                  onChange={(e) => setNewSystem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addToList("critical_systems", newSystem, setNewSystem)}
                  placeholder="Add critical system (press Enter)..."
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none"
                />
                <button
                  onClick={() => addToList("critical_systems", newSystem, setNewSystem)}
                  className="px-3 py-2 bg-muted text-sm rounded-lg hover:bg-muted/70"
                >
                  Add
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Regulatory Obligations</label>
              <p className="text-xs text-muted-foreground mb-2">Compliance frameworks and regulations that apply to your organization</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {(orgForm.regulatory_obligations ?? []).map((r, i) => (
                  <span key={i} className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded-full">
                    {r}
                    <button onClick={() => removeFromList("regulatory_obligations", i)} className="hover:text-red-500 ml-0.5">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newObligation}
                  onChange={(e) => setNewObligation(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addToList("regulatory_obligations", newObligation, setNewObligation)}
                  placeholder="e.g. HIPAA, PCI DSS, SOC 2 (press Enter)..."
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none"
                />
                <button
                  onClick={() => addToList("regulatory_obligations", newObligation, setNewObligation)}
                  className="px-3 py-2 bg-muted text-sm rounded-lg hover:bg-muted/70"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-semibold">Communications Voice & Guidelines</h3>
            <p className="text-sm text-muted-foreground -mt-2">Used by AI to generate breach notifications and crisis comms in your organization's tone</p>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Communication Voice</label>
              <textarea
                value={orgForm.comm_voice ?? ""}
                onChange={(e) => setOrgForm({ ...orgForm, comm_voice: e.target.value })}
                rows={4}
                placeholder="Describe your organization's communication voice and tone. E.g.: 'We communicate with transparency and empathy. We use clear, non-technical language with customers. We are direct with regulators and provide full detail...' "
                className="w-full mt-1.5 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Communication Guidelines</label>
              <textarea
                value={orgForm.comm_guidelines ?? ""}
                onChange={(e) => setOrgForm({ ...orgForm, comm_guidelines: e.target.value })}
                rows={4}
                placeholder="Specific guidelines for crisis communications. E.g.: 'Always involve Legal before external communications. Customer notifications require VP approval. Do not use the word breach in customer communications until confirmed...' "
                className="w-full mt-1.5 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => saveMutation.mutate(orgForm)}
              disabled={saveMutation.isPending}
              className="px-6 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saveMutation.isPending ? "Saving..." : "Save Knowledge Base"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "contacts" && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => setShowContactForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Contact
            </button>
          </div>

          {showContactForm && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="font-semibold text-sm">New Contact</h3>
              <div className="grid grid-cols-2 gap-3">
                <input value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} placeholder="Full name..." className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none" />
                <input value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} placeholder="Role / title..." className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none" />
                <input value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} placeholder="Email..." type="email" className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none" />
                <input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} placeholder="Phone..." className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none" />
                <input value={contactForm.organization} onChange={(e) => setContactForm({ ...contactForm, organization: e.target.value })} placeholder="Organization..." className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none" />
                <select value={contactForm.type} onChange={(e) => setContactForm({ ...contactForm, type: e.target.value as "INTERNAL" | "EXTERNAL" | "VENDOR" })} className="px-3 py-2 text-sm border border-border rounded-lg bg-background">
                  <option value="INTERNAL">Internal</option>
                  <option value="EXTERNAL">External</option>
                  <option value="VENDOR">Vendor</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => addContactMutation.mutate(contactForm)} disabled={!contactForm.name || addContactMutation.isPending} className="flex-1 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50">Add Contact</button>
                <button onClick={() => setShowContactForm(false)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
              </div>
            </div>
          )}

          {["INTERNAL", "EXTERNAL", "VENDOR"].map((type) => (
            <div key={type} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
                {type === "INTERNAL" ? <Users className="h-4 w-4 text-primary" /> : <Phone className="h-4 w-4 text-primary" />}
                <h3 className="font-semibold text-sm">{type} Contacts</h3>
                <span className="text-xs text-muted-foreground ml-1">({contactsByType(type).length})</span>
              </div>
              <div className="divide-y divide-border">
                {contactsByType(type).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">No {type.toLowerCase()} contacts</p>
                ) : contactsByType(type).map((contact) => (
                  <div key={contact.id} className="px-5 py-3 flex items-center gap-4 hover:bg-muted/20">
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      <div>
                        <p className="text-sm font-medium">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">{contact.role}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{contact.organization}</p>
                      <p className="text-sm text-muted-foreground">{contact.email}</p>
                      <p className="text-sm text-muted-foreground">{contact.phone}</p>
                    </div>
                    <button onClick={() => deleteContactMutation.mutate(contact.id)} className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors rounded">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
