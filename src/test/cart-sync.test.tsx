import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Records a database call only when the query is actually sent (awaited / .then-ed), like the real client.
const sent: { table: string; op: string }[] = [];
function builder(table: string) {
  let op = "select";
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) b[m] = () => b;
  for (const m of ["insert", "upsert", "delete", "update"])
    b[m] = () => {
      op = m;
      return b;
    };
  b["then"] = (resolve: (v: unknown) => unknown) => {
    sent.push({ table, op });
    return Promise.resolve({ data: [], error: null }).then(resolve);
  };
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t) },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "u1" }, session: {}, loading: false }),
}));
vi.mock("@/lib/catalog", () => ({ signImageUrls: async () => new Map() }));

import { BagProvider, useBag } from "@/lib/cart";

let bag: ReturnType<typeof useBag>;
function Grab() {
  bag = useBag();
  return null;
}
const item = {
  productId: "p1",
  slug: "s",
  name: "n",
  price: 100,
  colour: "Black",
  size: "M",
  quantity: 1,
};

async function mountSignedIn() {
  render(
    <BagProvider>
      <Grab />
    </BagProvider>,
  );
  await waitFor(() =>
    expect(sent.some((c) => c.table === "cart_items" && c.op === "select")).toBe(true),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  sent.length = 0;
}
const wrote = (table: string, op: string) => sent.some((c) => c.table === table && c.op === op);

describe("signed-in bag and wishlist are saved to the account", () => {
  beforeEach(() => {
    sent.length = 0;
    localStorage.clear();
  });

  it("adding to the bag saves the item", async () => {
    await mountSignedIn();
    await act(async () => {
      bag.add(item);
    });
    await waitFor(() => expect(wrote("cart_items", "upsert")).toBe(true));
  });

  it("removing from the bag deletes the saved item", async () => {
    await mountSignedIn();
    await act(async () => {
      bag.add(item);
    });
    await act(async () => {
      bag.remove(bag.items[0]!.key);
    });
    await waitFor(() => expect(wrote("cart_items", "delete")).toBe(true));
  });

  it("emptying the bag after an order deletes the saved bag before it resolves", async () => {
    await mountSignedIn();
    await act(async () => {
      await bag.clear();
    });
    expect(wrote("cart_items", "delete")).toBe(true);
  });

  it("wishlisting a product saves it", async () => {
    await mountSignedIn();
    await act(async () => {
      bag.toggleWish("p1");
    });
    await waitFor(() => expect(wrote("wishlists", "upsert")).toBe(true));
  });
});
