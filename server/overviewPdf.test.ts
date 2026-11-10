import { describe, expect, it } from "vitest";
import type { V2Filters } from "../shared/v2Types";
import {
  buildOverviewPdfFilterLabels,
  buildOverviewPdfFilterText,
  buildOverviewPdfMetadata,
  buildOverviewPdfPrintCss,
  buildOverviewPdfTitle,
  escapeOverviewPdfHtml,
  sanitizeOverviewPdfClone,
  validateOverviewPdfDateRange,
} from "../client/src/lib/overviewPdf";

const filters: V2Filters = {
  dateFrom: "2026-10-01",
  dateTo: "2026-10-31",
  model: "MG4",
  channel: "Meta",
  campaign: "Urban",
  dealer: "MG Motors Centro",
  search: "Ana <personal@example.com>",
};

describe("Overview PDF helpers", () => {
  it("gera título determinístico com as datas solicitadas", () => {
    expect(buildOverviewPdfTitle("2026-10-01", "2026-10-31")).toBe(
      "MG_Overview_2026-10-01_2026-10-31"
    );
  });

  it("mantém os filtros dimensionais e mascara completamente o search", () => {
    const labels = buildOverviewPdfFilterLabels(filters, "pt-BR");
    const filterText = buildOverviewPdfFilterText(filters, "pt-BR");

    expect(labels).toEqual([
      { key: "model", label: "Modelo", value: "MG4" },
      { key: "channel", label: "Canal", value: "Meta" },
      { key: "campaign", label: "Campanha", value: "Urban" },
      { key: "dealer", label: "Concessionária", value: "MG Motors Centro" },
      { key: "search", label: "Busca", value: "Search filter applied" },
    ]);
    expect(filterText).toContain("Modelo: MG4");
    expect(filterText).toContain("Canal: Meta");
    expect(filterText).toContain("Concessionária: MG Motors Centro");
    expect(filterText).toContain("Search filter applied");
    expect(filterText).not.toContain("Ana");
    expect(filterText).not.toContain("personal@example.com");
  });

  it("representa latestLeadDate ausente como N/A e inclui o alerta de atraso", () => {
    const metadata = buildOverviewPdfMetadata({
      locale: "en",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
      cutoff: "2026-10-31",
      latestLeadDate: null,
      filters: { dateFrom: "2026-10-01", dateTo: "2026-10-31" },
      generatedAt: new Date("2026-10-31T15:30:00.000Z"),
    });

    expect(metadata.title).toBe("MG_Overview_2026-10-01_2026-10-31");
    expect(metadata.latestLeadLabel).toBe("Latest Lead: N/A");
    expect(metadata.latestLeadWarning).toMatch(/unavailable/i);
    expect(metadata.cutoffLabel).toContain("D-1 São Paulo");
  });

  it("rejeita período invertido e qualquer data futura sem falsificar o intervalo", () => {
    expect(() =>
      validateOverviewPdfDateRange({
        dateFrom: "2026-10-31",
        dateTo: "2026-10-01",
        cutoff: "2026-10-30",
        now: new Date("2026-11-01T12:00:00.000Z"),
      })
    ).toThrow(/dateFrom cannot be later than dateTo/i);

    expect(() =>
      validateOverviewPdfDateRange({
        dateFrom: "2099-01-01",
        dateTo: "2099-01-31",
        cutoff: "2099-01-30",
        now: new Date("2026-11-01T12:00:00.000Z"),
      })
    ).toThrow(/future/i);
  });

  it("rejects dates beyond D-1 and today's cutoff in São Paulo without rewriting the data", () => {
    expect(() =>
      validateOverviewPdfDateRange({
        dateFrom: "2026-10-01",
        dateTo: "2026-10-31",
        cutoff: "2026-10-30",
        now: new Date("2026-11-01T12:00:00Z"),
      })
    ).toThrow(/D-1/);
    expect(() =>
      validateOverviewPdfDateRange({
        dateFrom: "2026-11-01",
        dateTo: "2026-11-01",
        cutoff: "2026-11-01",
        now: new Date("2026-11-01T12:00:00Z"),
      })
    ).toThrow(/before today/);
  });

  it("escapa texto para consumidores que precisem montar HTML", () => {
    expect(escapeOverviewPdfHtml(`<script>alert("x")</script> & 'safe'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;safe&#39;"
    );
  });

  it("declara impressão A4 landscape e regras para tabelas, SVG e rolagem", () => {
    const css = buildOverviewPdfPrintCss();
    expect(css).toContain("size: A4 landscape");
    expect(css).toContain("max-height: none !important");
    expect(css).toContain("min-width: 0 !important");
    expect(css).toContain("break-inside: avoid");
    expect(css).toContain(".overview-pdf-svg-wrap");
  });

  it("exercita sanitização DOM quando um ambiente compatível está disponível", () => {
    if (typeof document === "undefined") return;

    const root = document.createElement("section");
    root.setAttribute("data-overview-pdf-root", "true");
    root.innerHTML = `
      <button onclick="javascript:alert(1)">Admin</button>
      <select><option>Historical scenario</option></select>
      <details><summary>Details</summary><p>Visible values</p></details>
      <div data-overview-pdf-exclude>Private source warning</div>
      <div data-overview-pdf-only style="display:none" hidden>PDF ranking</div>
      <svg viewBox="0 0 100 40" onclick="javascript:alert(1)"><path d="M0 0h100v40H0z" /></svg>
      <div role="tooltip">Tooltip</div>
    `;

    const clone = sanitizeOverviewPdfClone(root);
    expect(clone.querySelector("button")).toBeNull();
    expect(clone.querySelector("[data-overview-pdf-exclude]")).toBeNull();
    expect(clone.querySelector('[role="tooltip"]')).toBeNull();
    expect(clone.querySelector("select")).toBeNull();
    expect(
      clone.querySelector("[data-overview-pdf-selected-option]")?.textContent
    ).toBe("Historical scenario");
    expect(clone.querySelector("details")?.hasAttribute("open")).toBe(true);
    expect(clone.querySelector("svg")?.getAttribute("onclick")).toBeNull();
    expect(clone.querySelector(".overview-pdf-svg-wrap")).not.toBeNull();
    expect(
      clone.querySelector("[data-overview-pdf-only]")?.getAttribute("style")
    ).toContain("display: block");
    expect(
      clone.querySelector("[data-overview-pdf-only]")?.hasAttribute("hidden")
    ).toBe(false);
    expect(
      root.querySelector("[data-overview-pdf-only]")?.getAttribute("style")
    ).toBe("display:none");
  });
});
