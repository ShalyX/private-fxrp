import { describe, expect, it } from "vitest";
import { navigationItems, viewForNavigation } from "./navigation";

describe("sidebar navigation", () => {
  it("exposes four distinct destinations", () => {
    expect(navigationItems.map((item) => item.view)).toEqual([
      "landing",
      "issuer",
      "vault",
      "network"
    ]);
  });

  it("maps each sidebar item to its own view", () => {
    expect(navigationItems.map((item) => viewForNavigation(item.id))).toEqual([
      "landing",
      "issuer",
      "vault",
      "network"
    ]);
  });
});
