import { describe, expect, it } from "vitest";
import {
  canAccessCRM,
  canAccessDispatch,
  canAccessLeads,
  canAccessMediaPlan,
  canAccessOverview,
  canAccessRegions,
  canExportLeads,
  canValidateCRM,
  isClientProfile,
  isAdministrator,
  isOverviewOnlyClient,
  normalizeUserRole,
  ROLE_LABELS,
} from "../shared/accountRoles";

describe("shared account roles", () => {
  it("labels BBRO and allows CRM validation only for admin or BBRO", () => {
    expect(ROLE_LABELS.bbro).toBe("BBRO");
    expect(ROLE_LABELS.client_admin).toBe("ADM - Cliente");
    expect(canValidateCRM("admin")).toBe(true);
    expect(canValidateCRM("bbro")).toBe(true);
    expect(canValidateCRM("client")).toBe(false);
    expect(canValidateCRM("client_admin")).toBe(false);
  });

  it("keeps administrator status exclusive to admin", () => {
    expect(isAdministrator("admin")).toBe(true);
    expect(isAdministrator("bbro")).toBe(false);
    expect(isAdministrator("client")).toBe(false);
  });

  it("separa Cliente da leitura legada ADM - Cliente", () => {
    expect(isClientProfile("client")).toBe(true);
    expect(isClientProfile("client_admin")).toBe(true);
    expect(isOverviewOnlyClient("client")).toBe(true);
    expect(isOverviewOnlyClient("client_admin")).toBe(false);
    expect(canAccessOverview("client")).toBe(true);
    expect(canAccessRegions("client")).toBe(false);
    expect(canAccessCRM("client")).toBe(false);
    expect(canAccessLeads("client")).toBe(false);
    expect(canAccessMediaPlan("client")).toBe(false);
    expect(canAccessDispatch("client")).toBe(false);
    expect(canExportLeads("client")).toBe(false);
    expect(canAccessRegions("client_admin")).toBe(true);
    expect(canAccessCRM("client_admin")).toBe(true);
    expect(canAccessLeads("client_admin")).toBe(true);
    expect(canAccessMediaPlan("client_admin")).toBe(true);
    expect(canAccessDispatch("client_admin")).toBe(true);
    expect(canExportLeads("client_admin")).toBe(true);
  });

  it("trata papel desconhecido como Cliente restrito", () => {
    expect(normalizeUserRole("role-inexistente")).toBe("client");
    expect(isOverviewOnlyClient("role-inexistente")).toBe(true);
    expect(canAccessOverview("role-inexistente")).toBe(true);
    expect(canAccessRegions("role-inexistente")).toBe(false);
    expect(canAccessLeads("role-inexistente")).toBe(false);
    expect(isAdministrator("role-inexistente")).toBe(false);
  });
});
