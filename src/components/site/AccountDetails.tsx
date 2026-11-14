import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const FIELDS = [["full_name", "Full name"], ["phone", "Phone"], ["line1", "Address line 1"], ["line2", "Address line 2 (optional)"], ["city", "City"], ["state", "State"], ["postal_code", "PIN code"]] as const;
type Addr = Record<(typeof FIELDS)[number][0], string>;
const EMPTY: Addr = { full_name: "", phone: "", line1: "", line2: "", city: "", state: "", postal_code: "" };

export function ProfileForm({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["profile", userId], queryFn: async () => (await supabase.from("profiles").select("*").eq("id", userId).maybeSingle()).data });
  const [f, setF] = useState({ full_name: "", phone: "" });
  useEffect(() => { if (data) setF({ full_name: data.full_name ?? "", phone: data.phone ?? "" }); }, [data]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("profiles").upsert({ id: userId, full_name: f.full_name.trim() || null, phone: f.phone.trim() || null });
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved");
    qc.invalidateQueries({ queryKey: ["profile", userId] });
  }
  return (
    <form onSubmit={save} className="mt-6 grid gap-4 border p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div><Label htmlFor="pf-name">Name</Label><Input id="pf-name" className="mt-1" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
      <div><Label htmlFor="pf-phone">Phone</Label><Input id="pf-phone" type="tel" className="mt-1" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      <Button type="submit">Save</Button>
    </form>
  );
}

export function AddressBook({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const key = ["addresses", userId];
  const { data: list = [] } = useQuery({ queryKey: key, queryFn: async () => (await supabase.from("addresses").select("*").order("is_default", { ascending: false }).order("created_at")).data ?? [] });
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState<Addr>(EMPTY);
  const refresh = () => qc.invalidateQueries({ queryKey: ["addresses"] });

  function start(id: string | "new") {
    const a = list.find((x) => x.id === id);
    setF(a ? { full_name: a.full_name, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", city: a.city, state: a.state, postal_code: a.postal_code } : EMPTY);
    setEditing(id);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const row = { ...f, line2: f.line2 || null };
    const { error } = editing === "new"
      ? await supabase.from("addresses").insert({ ...row, user_id: userId, is_default: list.length === 0 })
      : await supabase.from("addresses").update(row).eq("id", editing!);
    if (error) { toast.error(error.message); return; }
    toast.success("Address saved"); setEditing(null); refresh();
  }
  async function del(id: string) {
    const { error } = await supabase.from("addresses").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }
  async function makeDefault(id: string) {
    await supabase.from("addresses").update({ is_default: false }).eq("user_id", userId);
    await supabase.from("addresses").update({ is_default: true }).eq("id", id);
    refresh();
  }

  return (
    <div className="mt-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((a) => (
          <div key={a.id} className="border p-4 text-sm">
            <p className="font-medium">{a.full_name}{a.is_default && <span className="eyebrow ml-2 text-burgundy">Default</span>}</p>
            <p className="text-xs text-muted-foreground">{a.phone}</p>
            <p className="mt-1 text-xs text-muted-foreground">{[a.line1, a.line2, a.city, a.state, a.postal_code].filter(Boolean).join(", ")}</p>
            <div className="mt-3 flex gap-3 text-xs underline-offset-4">
              <button onClick={() => start(a.id)} className="hover:underline">Edit</button>
              {!a.is_default && <button onClick={() => makeDefault(a.id)} className="hover:underline">Make default</button>}
              <button onClick={() => del(a.id)} className="text-burgundy hover:underline">Delete</button>
            </div>
          </div>
        ))}
      </div>
      {editing ? (
        <form onSubmit={save} className="mt-4 grid gap-3 border p-5 sm:grid-cols-2">
          {FIELDS.map(([k, label]) => (
            <div key={k}><Label htmlFor={`ad-${k}`}>{label}</Label><Input id={`ad-${k}`} className="mt-1" required={k !== "line2"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
          ))}
          <div className="flex gap-3 sm:col-span-2"><Button type="submit">Save address</Button><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
        </form>
      ) : (
        <Button variant="outline" className="mt-4" onClick={() => start("new")}>Add address</Button>
      )}
    </div>
  );
}
