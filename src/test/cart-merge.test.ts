import { describe, expect, it } from "vitest";
import { bagKey, mergeBags, type BagItem } from "@/lib/cart";

const item = (q: number, size = "M"): BagItem => ({ key: bagKey("p1", null, size), productId: "p1", slug: "s", name: "n", price: 100, colour: null, size, quantity: q });

describe("guest bag merge on sign-in", () => {
  it("adds quantities of the same item", () => expect(mergeBags([item(2)], [item(3)])[0]!.quantity).toBe(5));
  it("caps merged quantity at 20", () => expect(mergeBags([item(15)], [item(10)])[0]!.quantity).toBe(20));
  it("keeps guest items the account did not have", () => expect(mergeBags([item(1)], [item(1, "L")])).toHaveLength(2));
});
