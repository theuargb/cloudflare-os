// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { GatekeeperAppInfo } from "@gadgets/workshop-shared/api";
import { sanitizeAppNavigation } from "@gadgets/workshop-shared/app-host";
import { buildSidebarDefaults } from "./sidebarNavDefs";

const item = (id: string, title = id) => ({ id, title, route: `${id}?entry=${id}` });

describe("sanitizeAppNavigation sidebar", () => {
  it("keeps only well-formed groups and items, with ids unique across the tree", () => {
    const navigation = sanitizeAppNavigation({
      actions: [],
      sidebar: [
        { title: " Облік ", order: 100, items: [item("ledger"), { id: "ledger", title: "dup", route: "x?entry=ledger" }] },
        { title: "Фінанси", order: 200, items: [item("ledger"), { id: "bank", title: "Банк", route: "bank?entry=cash" }] },
        { title: " ", order: 1, items: [item("trade")] },
        { title: "Без порядку", order: Number.NaN, items: [item("hr")] },
      ],
    });
    expect(navigation.sidebar).toEqual([{ title: "Облік", order: 100, items: [{ ...item("ledger"), icon: undefined }] }]);
  });

  it("omits the tree when no group survives", () => {
    expect(sanitizeAppNavigation({ actions: [], sidebar: [{ title: "Облік", order: 100, items: [] }] })).toEqual({ actions: [] });
  });
});

describe("buildSidebarDefaults", () => {
  const ledger: GatekeeperAppInfo = { id: "ledger", title: "Головна книга", group: { title: "Облік", order: 100 }, order: 101 };
  const peak: GatekeeperAppInfo = { id: "peak", title: "PEAK" };

  it("replaces an app's row by its tree, merging groups by title and ordering them", () => {
    const defaults = buildSidebarDefaults([ledger, peak], [{
      appId: "peak",
      actions: [],
      sidebar: [
        { title: "Облік", order: 100, items: [item("numbering"), item("reference-data")] },
        { title: "Фінанси", order: 50, items: [item("bank-cash")] },
      ],
    }]);

    expect(defaults.structure.main).toEqual(["builtin:home"]);
    expect(defaults.structure.groups).toEqual([
      { key: "group:Фінанси", items: ["app:peak:bank-cash"] },
      { key: "group:Облік", items: ["app:peak:numbering", "app:peak:reference-data", "app:ledger"] },
    ]);
    expect(defaults.items.get("app:peak:numbering")).toMatchObject({
      search: { at: "numbering?entry=numbering" },
      entry: { id: "numbering", first: true },
    });
    expect(defaults.items.get("app:peak:bank-cash")?.entry).toEqual({ id: "bank-cash", first: false });
  });

  it("keeps the app's own row while its navigation has no tree", () => {
    const defaults = buildSidebarDefaults([ledger, peak], [{ appId: "peak", actions: [] }]);
    expect(defaults.structure.main).toEqual(["builtin:home", "app:peak"]);
    expect(defaults.structure.groups).toEqual([{ key: "group:Облік", items: ["app:ledger"] }]);
  });
});
