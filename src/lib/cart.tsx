import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { signImageUrls } from "@/lib/catalog";

export type BagItem = {
  key: string;
  productId: string;
  slug: string;
  name: string;
  price: number;
  image?: string | undefined;
  colour: string | null;
  size: string;
  quantity: number;
};

type BagCtx = {
  items: BagItem[];
  count: number;
  subtotal: number;
  add: (item: Omit<BagItem, "key">) => void;
  setQuantity: (key: string, q: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  wishlist: string[];
  toggleWish: (productId: string) => void;
};

const Ctx = createContext<BagCtx | null>(null);
const BAG_KEY = "astra-bag-v1";
const WISH_KEY = "astra-wishlist-v1";
const MAX_QTY = 20;

export const bagKey = (productId: string, colour: string | null, size: string) => `${productId}:${colour ?? ""}:${size}`;

/** Merge guest items into saved items: same product/colour/size adds quantities, capped at 20. */
export function mergeBags(saved: BagItem[], guest: BagItem[]): BagItem[] {
  const out = saved.map((i) => ({ ...i }));
  for (const g of guest) {
    const f = out.find((i) => i.key === g.key);
    if (f) f.quantity = Math.min(MAX_QTY, f.quantity + g.quantity);
    else out.push({ ...g, quantity: Math.min(MAX_QTY, g.quantity) });
  }
  return out;
}

function readLocal<T>(k: string): T[] {
  try { return JSON.parse(localStorage.getItem(k) ?? "[]"); } catch { return []; }
}

async function loadRemote(userId: string) {
  const [{ data: cart }, { data: wish }] = await Promise.all([
    supabase.from("cart_items").select("product_id, colour, size, quantity, products(slug, name, price, status, product_images(url, kind, sort_order))").eq("user_id", userId).order("created_at"),
    supabase.from("wishlists").select("product_id").eq("user_id", userId),
  ]);
  const rows = (cart ?? []).filter((r) => r.products);
  const pick = (imgs: { url: string; kind: string; sort_order: number }[]) =>
    [...imgs].sort((a, b) => a.sort_order - b.sort_order).find((i) => i.kind === "model")?.url ?? imgs[0]?.url;
  const signed = await signImageUrls(rows.map((r) => pick(r.products!.product_images) ?? ""));
  const items: BagItem[] = rows.map((r) => {
    const colour = r.colour || null;
    const img = pick(r.products!.product_images);
    return { key: bagKey(r.product_id, colour, r.size), productId: r.product_id, slug: r.products!.slug, name: r.products!.name, price: r.products!.price, image: img ? signed.get(img) ?? img : undefined, colour, size: r.size, quantity: r.quantity };
  });
  return { items, wishlist: (wish ?? []).map((w) => w.product_id) };
}

export function BagProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<BagItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [mode, setMode] = useState<"pending" | "guest" | "user">("pending");
  const [open, setOpen] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Load bag: guest → localStorage; signed in → merge guest items into the account, then load from the database.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    if (!userId) {
      setItems(readLocal<BagItem>(BAG_KEY));
      setWishlist(readLocal<string>(WISH_KEY));
      setMode("guest");
      return;
    }
    setMode("pending");
    (async () => {
      const guestItems = readLocal<BagItem>(BAG_KEY);
      const guestWish = readLocal<string>(WISH_KEY);
      if (guestItems.length || guestWish.length) {
        const remote = await loadRemote(userId);
        const merged = mergeBags(remote.items, guestItems);
        const touched = merged.filter((m) => guestItems.some((g) => g.key === m.key));
        if (touched.length)
          await supabase.from("cart_items").upsert(
            touched.map((i) => ({ user_id: userId, product_id: i.productId, colour: i.colour ?? "", size: i.size, quantity: i.quantity })),
            { onConflict: "user_id,product_id,colour,size" },
          );
        if (guestWish.length)
          await supabase.from("wishlists").upsert(guestWish.map((product_id) => ({ user_id: userId, product_id })), { onConflict: "user_id,product_id", ignoreDuplicates: true });
        localStorage.removeItem(BAG_KEY);
        localStorage.removeItem(WISH_KEY);
      }
      const fresh = await loadRemote(userId);
      if (cancelled) return;
      setItems(fresh.items);
      setWishlist(fresh.wishlist);
      setMode("user");
    })().catch(() => { if (!cancelled) setMode("user"); });
    return () => { cancelled = true; };
  }, [userId, loading]);

  useEffect(() => { if (mode === "guest") localStorage.setItem(BAG_KEY, JSON.stringify(items)); }, [items, mode]);
  useEffect(() => { if (mode === "guest") localStorage.setItem(WISH_KEY, JSON.stringify(wishlist)); }, [wishlist, mode]);

  const saveRow = useCallback((i: BagItem) => {
    if (!userId) return;
    void supabase.from("cart_items").upsert(
      { user_id: userId, product_id: i.productId, colour: i.colour ?? "", size: i.size, quantity: i.quantity },
      { onConflict: "user_id,product_id,colour,size" },
    );
  }, [userId]);
  const deleteRow = useCallback((i: BagItem) => {
    if (!userId) return;
    void supabase.from("cart_items").delete().eq("user_id", userId).eq("product_id", i.productId).eq("colour", i.colour ?? "").eq("size", i.size);
  }, [userId]);

  const add = useCallback((item: Omit<BagItem, "key">) => {
    const key = bagKey(item.productId, item.colour, item.size);
    const next = mergeBags(itemsRef.current, [{ ...item, key }]);
    setItems(next);
    saveRow(next.find((i) => i.key === key)!);
  }, [saveRow]);
  const setQuantity = useCallback((key: string, q: number) => {
    const next = itemsRef.current.map((i) => (i.key === key ? { ...i, quantity: Math.max(1, Math.min(MAX_QTY, q)) } : i));
    setItems(next);
    const row = next.find((i) => i.key === key);
    if (row) saveRow(row);
  }, [saveRow]);
  const remove = useCallback((key: string) => {
    const row = itemsRef.current.find((i) => i.key === key);
    setItems((prev) => prev.filter((i) => i.key !== key));
    if (row) deleteRow(row);
  }, [deleteRow]);
  const clear = useCallback(() => {
    setItems([]);
    if (userId) void supabase.from("cart_items").delete().eq("user_id", userId);
  }, [userId]);
  const toggleWish = useCallback((productId: string) => {
    setWishlist((w) => {
      const has = w.includes(productId);
      if (userId) {
        if (has) void supabase.from("wishlists").delete().eq("user_id", userId).eq("product_id", productId);
        else void supabase.from("wishlists").insert({ user_id: userId, product_id: productId });
      }
      return has ? w.filter((s) => s !== productId) : [...w, productId];
    });
  }, [userId]);

  const value = useMemo(
    () => ({
      items,
      count: items.reduce((s, i) => s + i.quantity, 0),
      subtotal: items.reduce((s, i) => s + i.quantity * i.price, 0),
      add, setQuantity, remove, clear, open, setOpen, wishlist, toggleWish,
    }),
    [items, add, setQuantity, remove, clear, open, wishlist, toggleWish],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBag() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBag must be used inside BagProvider");
  return c;
}
