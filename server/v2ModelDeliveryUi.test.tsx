import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { V2ModelDeliveryCard } from "../client/src/components/V2ModelDeliveryCard";

describe("Leads por modelo do Administrador", () => {
  it("concilia aliases exatos e preserva o total sem inferir modelos desconhecidos", () => {
    const html = renderToStaticMarkup(
      <V2ModelDeliveryCard
        items={[
          { label: "MG4", count: 10 },
          { label: "MG 4 Luxury", count: 2 },
          { label: "MG Urban", count: 5 },
          { label: "campanha com MG4 desconhecida", count: 3 },
        ]}
        total={20}
      />
    );
    expect(html).toContain("Leads por modelo");
    expect(html).toContain("MG 4");
    expect(html).not.toContain("MG4");
    expect(html).toContain(">12</strong>");
    expect(html).toContain("60%");
    expect(html).toContain("Modelo não identificado");
    expect(html).toContain(">3</strong>");
    expect(html).not.toContain("campanha com");
  });

  it("não fabrica dados em recorte vazio e preserva zero real", () => {
    const empty = renderToStaticMarkup(
      <V2ModelDeliveryCard items={[]} total={0} />
    );
    expect(empty).toContain("Nenhum Lead neste filtro");
    const zero = renderToStaticMarkup(
      <V2ModelDeliveryCard items={[{ label: "MG S5", count: 0 }]} total={0} />
    );
    expect(zero).toContain(">0</strong>");
    expect(zero).toContain("Participação indisponível");
    expect(zero).not.toContain("NaN");
  });
});
