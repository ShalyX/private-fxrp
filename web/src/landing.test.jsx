import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LandingPage } from "./App";

describe("Veyra landing page", () => {
  it("presents the confidential flow, broader use cases, and live deployment proof", () => {
    const html = renderToStaticMarkup(
      <LandingPage onOpenAccess={vi.fn()} onOpenIssuer={vi.fn()} />
    );

    expect(html).toContain("Eligibility without exposure");
    expect(html).toContain("How Veyra works");
    expect(html).toContain("Encrypted in your browser");
    expect(html).toContain("Evaluated inside FCC");
    expect(html).toContain("Reusable onchain pass");
    expect(html).toContain("One private decision. Multiple FXRP products.");
    expect(html).toContain("Yield access");
    expect(html).toContain("Liquidity programs");
    expect(html).toContain("Institutional limits");
    expect(html).toContain("Live Coston2 proof");
    expect(html).toContain("PRODUCTION");
    expect(html).toContain("Request FXRP access");
    expect(html).toContain("Open issuer workspace");
  });
});
