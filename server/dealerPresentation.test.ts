import { describe, expect, it } from "vitest";
import { showDealerInCommercialTable } from "../shared/dealerPresentation";
import { OFFICIAL_DEALERS } from "../shared/dealerRegistry";

describe("apresentação da tabela comercial", () => {
  it("oculta a marcação EM BREVE independentemente de caixa ou espaços", () => {
    expect(showDealerInCommercialTable("Autobel Campo Grande (EM BREVE)")).toBe(
      false
    );
    expect(showDealerInCommercialTable("Loja (Em  Breve)")).toBe(false);
    expect(showDealerInCommercialTable("Autobrand Recife")).toBe(true);
  });
  it("filtra somente a apresentação sem alterar o cadastro oficial", () => {
    const original = OFFICIAL_DEALERS.map(dealer => dealer.name);
    const visible = OFFICIAL_DEALERS.filter(dealer =>
      showDealerInCommercialTable(dealer.name)
    );
    expect(visible.some(dealer => /em\s+breve/i.test(dealer.name))).toBe(false);
    expect(OFFICIAL_DEALERS.map(dealer => dealer.name)).toEqual(original);
    expect(visible).toEqual(
      OFFICIAL_DEALERS.filter(dealer => !/em\s+breve/i.test(dealer.name))
    );
  });
});
