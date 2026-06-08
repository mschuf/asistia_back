import type { DomainUser } from "../../glpi/mappers/user.mapper";
import { pickLastActiveTechnicianByName } from "./ticket-auto-assign.helpers";

function technician(
  partial: Pick<DomainUser, "id" | "fullName" | "locationId" | "isActive">,
): DomainUser {
  return {
    id: partial.id,
    login: `user${partial.id}`,
    firstName: null,
    lastName: null,
    fullName: partial.fullName,
    email: null,
    phone: null,
    mobile: null,
    locationId: partial.locationId,
    primaryGroupId: null,
    entityId: null,
    isActive: partial.isActive,
  };
}

describe("pickLastActiveTechnicianByName", () => {
  const technicians = [
    technician({ id: 1, fullName: "Ana TI", locationId: 10, isActive: true }),
    technician({ id: 2, fullName: "Zoe TI", locationId: 10, isActive: true }),
    technician({ id: 3, fullName: "Bravo TI", locationId: 20, isActive: true }),
    technician({ id: 4, fullName: "Inactivo TI", locationId: 10, isActive: false }),
  ];

  it("returns last active technician alphabetically for a site", () => {
    const result = pickLastActiveTechnicianByName(technicians, 10);
    expect(result?.id).toBe(2);
    expect(result?.fullName).toBe("Zoe TI");
  });

  it("excludes inactive technicians from the site pool", () => {
    const onlyInactive = [
      technician({ id: 5, fullName: "Inactivo", locationId: 10, isActive: false }),
    ];
    expect(pickLastActiveTechnicianByName(onlyInactive, 10)).toBeNull();
  });

  it("returns last active technician globally when location is missing", () => {
    const result = pickLastActiveTechnicianByName(technicians, null);
    expect(result?.id).toBe(2);
  });

  it("returns null when no active technicians match the site", () => {
    expect(pickLastActiveTechnicianByName(technicians, 99)).toBeNull();
  });
});
