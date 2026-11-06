import { describe, expect, it } from "vitest";
import { assertBbroDispatchScope } from "./v2Dispatch";

describe("escopo do Manual BBRO", () => {
  it("aceita loja CRM em dia fechado", () => {
    expect(() =>
      assertBbroDispatchScope("Autobrand Recife", "2026-11-04", "2026-11-04")
    ).not.toThrow();
  });
  it("bloqueia data futura e data inválida", () => {
    expect(() =>
      assertBbroDispatchScope("Autobrand Recife", "2026-11-05", "2026-11-04")
    ).toThrow();
    expect(() =>
      assertBbroDispatchScope("Autobrand Recife", "inválido", "2026-11-04")
    ).toThrow();
  });
  it("bloqueia unidade fora das quarenta lojas CRM", () => {
    expect(() =>
      assertBbroDispatchScope(
        "Sinal Av. Indianópolis",
        "2026-11-04",
        "2026-11-04"
      )
    ).toThrow();
    expect(() =>
      assertBbroDispatchScope("Loja desconhecida", "2026-11-04", "2026-11-04")
    ).toThrow();
  });
});

it("aceita o repasse sem dealer do CRM apenas em dia fechado", () => {
  expect(() =>
    assertBbroDispatchScope(
      "— Equipe repassa (loja não identificada) —",
      "2026-11-04",
      "2026-11-04"
    )
  ).not.toThrow();
  expect(() =>
    assertBbroDispatchScope("Leads em qualificação", "2026-11-05", "2026-11-04")
  ).toThrow();
});
