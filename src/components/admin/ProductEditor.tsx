import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { COLLECTIONS, IMAGE_BUCKET, STORAGE_PREFIX, slugify, type Product } from "@/lib/catalog";

const STATUSES = ["active", "draft", "sold_out"] as const;

export function ProductEditor({ product, open, onOpenChange }: { product: Product | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", subtitle: "", description: "", price: "", collection: "polos", status: "active", is_new: false, is_featured: false });
  const [busy, setBusy] = useState(false);
  const [colour, setColour] = useState({ name: "", hex: "#1f2a44" });

  useEffect(() => {
    if (!open) return;
    setF(product
      ? { name: product.name, subtitle: product.subtitle ?? "", description: product.description ?? "", price: String(product.price), collection: product.collection, status: product.status, is_new: product.is_new, is_featured: product.is_featured }
      : { name: "", subtitle: "", description: "", price: "", collection: "polos", status: "draft", is_new: true, is_featured: false });
  }, [open, product]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin"] }); qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["product"] }); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const price = parseInt(f.price, 10);
    if (!f.name.trim() || !(price >= 0)) { toast.error("Name and a valid price are required"); return; }
    setBusy(true);
    const row = { name: f.name.trim(), subtitle: f.subtitle || null, description: f.description || null, price, collection: f.collection, status: f.status, is_new: f.is_new, is_featured: f.is_featured };
    const { error } = product
      ? await supabase.from("products").update(row).eq("id", product.id)
      : await supabase.from("products").insert({ ...row, slug: `${slugify(f.name)}-${Date.now().toString(36)}` });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(product ? "Product saved" : "Product created — open it again to add photos and colours");
    refresh();
    if (!product) onOpenChange(false);
  }

  async function upload(files: FileList | null, kind: string) {
    if (!product || !files?.length) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      const path = `${product.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, "-")}`;
      const up = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type });
      if (up.error) { toast.error(up.error.message); continue; }
      const { error } = await supabase.from("product_images").insert({ product_id: product.id, url: STORAGE_PREFIX + path, kind, sort_order: product.images.length });
      if (error) toast.error(error.message);
    }
    setBusy(false);
    toast.success("Photos uploaded");
    refresh();
  }
  async function deleteImage(id: string, path: string) {
    const { error } = await supabase.from("product_images").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (path.startsWith(STORAGE_PREFIX)) await supabase.storage.from(IMAGE_BUCKET).remove([path.slice(STORAGE_PREFIX.length)]);
    refresh();
  }
  async function addColour() {
    if (!product || !colour.name.trim()) return;
    const { error } = await supabase.from("product_variants").insert({ product_id: product.id, colour_name: colour.name.trim(), colour_hex: colour.hex, sort_order: product.variants.length });
    if (error) { toast.error(error.message); return; }
    setColour({ name: "", hex: colour.hex });
    refresh();
  }
  async function deleteColour(id: string) {
    const { error } = await supabase.from("product_variants").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-3xl">{product ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="pe-name">Title</Label><Input id="pe-name" className="mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <div><Label htmlFor="pe-sub">Subtitle</Label><Input id="pe-sub" className="mt-1" value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} /></div>
          <div><Label htmlFor="pe-price">Price (₹)</Label><Input id="pe-price" type="number" min={0} className="mt-1" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required /></div>
          <div className="sm:col-span-2"><Label htmlFor="pe-desc">Description</Label><Textarea id="pe-desc" rows={4} className="mt-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div><Label htmlFor="pe-col">Collection</Label>
            <select id="pe-col" className="mt-1 h-10 w-full border bg-background px-2 text-sm" value={f.collection} onChange={(e) => setF({ ...f, collection: e.target.value })}>
              {COLLECTIONS.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select></div>
          <div><Label htmlFor="pe-status">Status</Label>
            <select id="pe-status" className="mt-1 h-10 w-full border bg-background px-2 text-sm" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_new} onChange={(e) => setF({ ...f, is_new: e.target.checked })} /> New arrival</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_featured} onChange={(e) => setF({ ...f, is_featured: e.target.checked })} /> Featured</label>
          <Button type="submit" disabled={busy} className="sm:col-span-2">{busy ? "Saving…" : product ? "Save details" : "Create product"}</Button>
        </form>

        {product && (
          <>
            <h3 className="eyebrow mt-6">Photos</h3>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {product.images.map((i) => (
                <div key={i.id} className="group relative aspect-[4/5] overflow-hidden bg-secondary">
                  <img src={i.url} alt="" className="size-full object-cover" />
                  <span className="absolute left-1 top-1 bg-background/90 px-1 text-[0.6rem] uppercase">{i.kind}</span>
                  <button type="button" onClick={() => deleteImage(i.id, i.path)} aria-label="Delete photo" className="absolute right-1 top-1 bg-background/90 p-1"><Trash2 className="size-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <label className="cursor-pointer border px-3 py-2 hover:bg-secondary">Upload on-model photo<input type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files, "model")} /></label>
              <label className="cursor-pointer border px-3 py-2 hover:bg-secondary">Upload product photo<input type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files, "product")} /></label>
            </div>

            <h3 className="eyebrow mt-6">Colours</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {product.variants.length === 0 && <p className="text-xs text-muted-foreground">No colours yet.</p>}
              {product.variants.map((v) => (
                <span key={v.id} className="flex items-center gap-2 border px-2 py-1 text-xs">
                  <span className="size-3 rounded-full border" style={{ background: v.colour_hex }} />{v.colour_name}
                  <button type="button" onClick={() => deleteColour(v.id)} aria-label={`Remove ${v.colour_name}`}><Trash2 className="size-3" /></button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Input placeholder="Colour name" value={colour.name} onChange={(e) => setColour({ ...colour, name: e.target.value })} />
              <input type="color" aria-label="Colour" value={colour.hex} onChange={(e) => setColour({ ...colour, hex: e.target.value })} className="h-10 w-12 border" />
              <Button type="button" variant="outline" onClick={addColour}>Add</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
