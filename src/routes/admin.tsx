import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProductEditor } from "@/components/admin/ProductEditor";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireSession } from "@/lib/auth";
import { SIZES, adminProductsQuery, formatINR, primaryImage, totalStock } from "@/lib/catalog";

const STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"] as const;

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const s = await requireSession(location.href);
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", s.user.id).eq("role", "admin");
    if (!data?.length) throw redirect({ to: "/account" });
  },
  head: () => ({ meta: [{ title: "Store Admin — ASTRA STYLIN" }, { name: "robots", content: "noindex" }] }),
  component: Admin,
});

function Admin() {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery(adminProductsQuery());
  const { data: orders = [] } = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: async () => (await supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false })).data ?? [],
  });

  const [editing, setEditing] = useState<string | "new" | null>(null);
  const editingProduct = editing && editing !== "new" ? products.find((p) => p.id === editing) ?? null : null;
  const live = orders.filter((o) => o.status !== "cancelled");
  const kpis = [
    ["Total revenue", formatINR(live.reduce((s, o) => s + o.total, 0))],
    ["Total orders", String(orders.length)],
    ["Pending fulfilment", String(orders.filter((o) => ["pending", "confirmed", "processing"].includes(o.status)).length)],
    ["Out of stock", String(products.filter((p) => p.status !== "draft" && p.inventory.some((i) => i.quantity <= 0)).length)],
  ];
  const outOfStock = products.filter((p) => p.status !== "draft" && p.inventory.some((i) => i.quantity <= 0));

  async function setStock(productId: string, size: string, value: string) {
    const quantity = Math.max(0, parseInt(value || "0", 10) || 0);
    const { error } = await supabase.from("inventory").upsert({ product_id: productId, size, quantity }, { onConflict: "product_id,size" });
    if (error) { toast.error(error.message); return; }
    toast.success("Stock saved");
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
  }
  async function setStatus(id: string, status: (typeof STATUSES)[number]) {
    const { error } = await supabase.rpc("admin_set_order_status", { p_order_id: id, p_status: status });
    if (error) { toast.error(error.message); return; }
    toast.success("Order updated");
    qc.invalidateQueries({ queryKey: ["admin"] });
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex items-center justify-between"><h1 className="font-display text-4xl">Store admin</h1><Link to="/" className="eyebrow hover:text-burgundy">View store →</Link></div>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map(([label, value]) => (
          <div key={label} className="border p-5"><p className="eyebrow text-muted-foreground">{label}</p><p className="font-display mt-2 text-3xl">{value}</p></div>
        ))}
      </div>
      {outOfStock.length > 0 && (
        <div className="mt-4 border border-burgundy/40 p-4 text-sm"><p className="eyebrow text-burgundy">Out of stock alerts</p>
          <ul className="mt-2 space-y-1 text-xs">{outOfStock.map((p) => <li key={p.id}>{p.name}: sizes {p.inventory.filter((i) => i.quantity <= 0).map((i) => i.size).join(", ")}{totalStock(p) <= 0 ? " (all sizes)" : ""}</li>)}</ul></div>
      )}

      <div className="mt-14 flex items-center justify-between"><h2 className="font-display text-3xl">Products</h2><Button onClick={() => setEditing("new")}>Add product</Button></div>
      <div className="mt-4 divide-y border">
        {products.map((p) => (
          <div key={p.id} className="flex items-center gap-4 p-3 text-sm">
            <div className="h-14 w-11 shrink-0 overflow-hidden bg-secondary">{primaryImage(p) && <img src={primaryImage(p)} alt="" className="size-full object-cover" />}</div>
            <div className="flex-1"><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{formatINR(p.price)} · {p.variants.length} colour(s) · {p.images.length} photo(s)</p></div>
            <span className="eyebrow border px-2 py-1">{p.status.replace("_", " ")}</span>
            <Button variant="outline" size="sm" onClick={() => setEditing(p.id)}>Edit</Button>
          </div>
        ))}
      </div>
      <ProductEditor product={editingProduct} open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} />

      <h2 className="font-display mt-14 text-3xl">Orders</h2>
      {orders.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No orders yet.</p> : (
        <div className="mt-4 divide-y border">
          {orders.map((o) => (
            <div key={o.id} className="grid gap-3 p-4 text-sm md:grid-cols-[1fr_2fr_auto_auto] md:items-center">
              <div><p className="font-medium">{o.order_number}</p><p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("en-IN")}</p></div>
              <div><p>{o.shipping_name} · {o.shipping_phone}</p><p className="text-xs text-muted-foreground">{o.order_items.map((i) => `${i.product_name} (${i.size}) ×${i.quantity}`).join(", ")}</p><p className="text-xs text-muted-foreground">{[o.line1, o.line2, o.city, o.state, o.postal_code].filter(Boolean).join(", ")}</p></div>
              <span>{formatINR(o.total)}</span>
              <select value={o.status} onChange={(e) => setStatus(o.id, e.target.value as (typeof STATUSES)[number])} className="h-9 border bg-background px-2 text-xs uppercase tracking-widest">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      <h2 className="font-display mt-14 text-3xl">Stock</h2>
      <p className="mt-1 text-xs text-muted-foreground">Type a number and click away to save.</p>
      <div className="mt-4 overflow-x-auto border">
        <table className="w-full text-sm">
          <thead className="bg-secondary"><tr><th className="eyebrow p-3 text-left">Product</th>{SIZES.map((s) => <th key={s} className="eyebrow p-3">{s}</th>)}</tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.name}<span className="block text-xs text-muted-foreground">{formatINR(p.price)}</span></td>
                {SIZES.map((s) => (
                  <td key={s} className="p-2 text-center">
                    <input type="number" min={0} defaultValue={p.inventory.find((i) => i.size === s)?.quantity ?? 0}
                      onBlur={(e) => { if (e.target.value !== e.target.defaultValue) setStock(p.id, s, e.target.value); }}
                      className="h-9 w-16 border bg-background text-center" aria-label={`${p.name} size ${s} stock`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
