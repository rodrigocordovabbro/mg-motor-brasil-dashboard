import { describe, expect, it } from "vitest";
import {
  canValidateCRM,
  isAdministrator,
  ROLE_LABELS,
} from "../shared/accountRoles";

describe("shared account roles", () => {
  it("labels BBRO and allows CRM validation only for admin or BBRO", () => {
    expect(ROLE_LABELS.bbro).toBe("BBRO");
    expect(canValidateCRM("admin")).toBe(true);
    expect(canValidateCRM("bbro")).toBe(true);
    expect(canValidateCRM("client")).toBe(false);
  });

  it("keeps administrator status exclusive to admin", () => {
    expect(isAdministrator("admin")).toBe(true);
    expect(isAdministrator("bbro")).toBe(false);
    expect(isAdministrator("client")).toBe(false);
  });
});
