import { describe, expect, it } from "vitest";
import {
  omitLeadCampaign,
  resolveLeadPeriodPreset,
} from "../shared/leadPeriodPresets";

describe("atalhos de período de Leads", () => {
  it("seleciona outubro inteiro a partir de novembro", () => {
    expect(resolveLeadPeriodPreset("Mês passado", "2026-11-04")).toEqual({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    });
  });
  it("usa o mês de hoje, não de ontem, no primeiro dia do mês", () => {
    expect(resolveLeadPeriodPreset("Mês passado", "2026-10-31")).toEqual({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    });
  });
  it("respeita a virada de ano", () => {
    expect(resolveLeadPeriodPreset("Mês passado", "2027-01-04")).toEqual({
      dateFrom: "2026-12-01",
      dateTo: "2026-12-31",
    });
  });
  it("respeita fevereiro bissexto", () => {
    expect(resolveLeadPeriodPreset("Mês passado", "2028-03-03")).toEqual({
      dateFrom: "2028-02-01",
      dateTo: "2028-02-29",
    });
  });
  it("mantém mês corrente até D-1 e períodos existentes", () => {
    expect(resolveLeadPeriodPreset("Mês", "2026-11-04")).toEqual({
      dateFrom: "2026-11-01",
      dateTo: "2026-11-04",
    });
    expect(resolveLeadPeriodPreset("7 dias", "2026-11-04")).toEqual({
      dateFrom: "2026-10-29",
      dateTo: "2026-11-04",
    });
  });
});

it("remove a campanha da consulta sem apagar os demais filtros", () => {
  const filtered = omitLeadCampaign({
    dateFrom: "2026-11-01",
    dateTo: "2026-11-04",
    model: "MG 4",
    campaign: "Campanha antiga",
  });
  expect(filtered).not.toHaveProperty("campaign");
  expect(filtered).toEqual({
    dateFrom: "2026-11-01",
    dateTo: "2026-11-04",
    model: "MG 4",
  });
});
