import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LeadsSectionNavigation,
  LEADS_SECTION_TABS,
} from "../client/src/components/LeadsSectionNavigation";
import { readFileSync } from "node:fs";

describe("Menu persistente de Leads", () => {
  it.each(LEADS_SECTION_TABS)(
    "mantém quatro opções e seleção correta em %s",
    activeTab => {
      const html = renderToStaticMarkup(
        <LeadsSectionNavigation activeTab={activeTab} onChange={() => {}} />
      );
      expect((html.match(/role="tab"/g) || []).length).toBe(4);
      expect((html.match(/aria-selected="true"/g) || []).length).toBe(1);
      expect((html.match(/tabindex="0"/g) || []).length).toBe(1);
      expect(html).toContain("min-h-12");
      expect(html).toContain("text-[15px]");
      expect(html).toContain("overflow-x-auto");
      expect(html).toContain("mg-leads-menu");
    }
  );
  it("usa uma única barra antes de qualquer carregamento ou conteúdo", () => {
    const source = readFileSync(
      new URL("../client/src/components/V2LeadsDashboard.tsx", import.meta.url),
      "utf8"
    );
    expect((source.match(/<LeadsSectionNavigation /g) || []).length).toBe(1);
    expect(source.indexOf("<LeadsSectionNavigation ")).toBeLessThan(
      source.indexOf('id="mg-leads-panel"')
    );
    expect(source).not.toContain('role="tablist"');
    const css = readFileSync(
      new URL("../client/src/index.css", import.meta.url),
      "utf8"
    );
    expect(css).toContain("top: var(--mg-app-header-height, 68px)");
  });
});
