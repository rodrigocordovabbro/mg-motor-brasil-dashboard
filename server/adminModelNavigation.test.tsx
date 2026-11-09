import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import {
  LeadsSectionNavigation,
  LEADS_SECTION_TABS,
  MODEL_ANALYSIS_TAB,
  canAnalyzeModels,
  getTabs,
} from "../client/src/components/LeadsSectionNavigation";

const dashboardSource = () =>
  readFileSync(
    new URL("../client/src/components/V2LeadsDashboard.tsx", import.meta.url),
    "utf8"
  );
const manifestSource = () =>
  readFileSync(
    new URL("../client/public/manus-routes.json", import.meta.url),
    "utf8"
  );

describe("navegação administrativa da análise por modelo", () => {
  it("mantém a ordem base e acrescenta a análise somente ao Administrador operacional", () => {
    expect(LEADS_SECTION_TABS).toEqual([
      "Visão Geral",
      "Lojas & CRM",
      "Regiões",
      "Leads",
    ]);
    expect(getTabs({ canManage: true })).toEqual([
      ...LEADS_SECTION_TABS,
      MODEL_ANALYSIS_TAB,
    ]);
    expect(getTabs({ canManage: false })).toEqual(LEADS_SECTION_TABS);
    expect(getTabs({ canManage: true, clientView: true })).toEqual(
      LEADS_SECTION_TABS
    );
    expect(getTabs({ canManage: true, overviewOnly: true })).toEqual([
      "Visão Geral",
    ]);

    const html = renderToStaticMarkup(
      <LeadsSectionNavigation
        activeTab={MODEL_ANALYSIS_TAB}
        onChange={() => {}}
        canManage
      />
    );
    expect((html.match(/role="tab"/g) || []).length).toBe(5);
    expect(html).toContain("Análise por modelo");
    expect(html).toContain('id="mg-leads-tab-4"');
    expect(html).toContain('aria-selected="true"');
  });

  it("falha fechado para BBRO, Cliente, ADM - Cliente e apresentação cliente", () => {
    expect(canAnalyzeModels({ canManage: false })).toBe(false);
    expect(canAnalyzeModels({ canManage: false, clientView: false })).toBe(
      false
    );
    expect(canAnalyzeModels({ canManage: true, clientView: true })).toBe(false);
    expect(canAnalyzeModels({ canManage: true, overviewOnly: true })).toBe(
      false
    );
    const html = renderToStaticMarkup(
      <LeadsSectionNavigation
        activeTab="Visão Geral"
        onChange={() => {}}
        canManage={false}
        clientView={true}
      />
    );
    expect(html).not.toContain("Análise por modelo");
  });

  it("declara a rota completa e normaliza model-analysis/models sem buscar para perfis negados", () => {
    const source = dashboardSource();
    const manifest = manifestSource();
    expect(manifest).toContain(
      '"path": "/?module=leads&tab=model-analysis"'
    );
    expect(source).toContain('tab === "model-analysis"');
    expect(source).toContain('tab === "models"');
    expect(source).toContain('url.searchParams.delete("tab")');
    expect(source).toContain("modelInsightsProcedure.useQuery(applied");
    expect(source).toContain("activeTab === MODEL_ANALYSIS_TAB");
    expect(source).toContain("data?.status === \"READY\"");
    expect(source).toContain("modelAnalysisAllowed");
  });
});
