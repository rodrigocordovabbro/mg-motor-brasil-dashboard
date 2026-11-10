import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2OverviewPdfButton } from "../client/src/components/V2OverviewPdfButton";
import type { V2Dashboard } from "../shared/v2Types";

const ready = {
  status: "READY",
  period: {
    dateFrom: "2026-11-01",
    dateTo: "2026-11-09",
    cutoffDate: "2026-11-09",
  },
} as V2Dashboard;
const render = (locale: "pt-BR" | "en", busy = false, data = ready) =>
  renderToStaticMarkup(
    <V2OverviewPdfButton
      rootRef={{ current: null }}
      data={data}
      filters={{ dateFrom: data.period.dateFrom, dateTo: data.period.dateTo }}
      busy={busy}
      locale={locale}
    />
  );

describe("Overview PDF button", () => {
  it("offers a local shareable PDF without administrative role requirements", () => {
    const html = render("en");
    expect(html).toContain('data-testid="overview-pdf-button"');
    expect(html).toContain("Export PDF");
    expect(html).toContain("Save as PDF");
    expect(html).toContain("4-page Overview");
    expect(html).toContain("latest stored dashboard data");
    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:=|\s|>)/);
    expect(html).toContain("data-overview-pdf-exclude");
  });
  it("uses Portuguese messages for the Portuguese interface", () => {
    const html = render("pt-BR");
    expect(html).toContain("Gerar PDF");
    expect(html).toContain("Salvar como PDF");
    expect(html).not.toContain("Export PDF");
  });
  it("prevents stale or unavailable exports during refresh and when not configured", () => {
    expect(render("en", true)).toMatch(/<button[^>]*\sdisabled(?:=|\s|>)/);
    expect(render("en", false, { ...ready, status: "NOT_CONFIGURED" })).toMatch(
      /<button[^>]*\sdisabled(?:=|\s|>)/
    );
  });
});
