import { VisitasService } from "./visitas.service";
import type { CreateVisitaDto } from "./dto/create-visita.dto";
import type { VisitaListRow } from "./visitas.types";
import type { PersonaRow } from "../personas/personas.types";

function makeMetricsRow() {
  return {
    month_visits: "0",
    day_visits: "0",
    active_only_admin: "0",
    active_only_factory: "0",
    active_both_zones: "0",
    active_stale_without_checkout: "0",
  };
}

function makeRow(overrides: Partial<VisitaListRow> = {}): VisitaListRow {
  return {
    id: "1",
    persona_id: "10",
    motivo_visita_id: "3",
    motivo: "Reunión",
    responsable_nombre: "Responsable",
    estado: "activa",
    estado_seguimiento: "activo",
    zonas_permitidas: ["administración"],
    credencial_numero: "T-1",
    tarjeta_color: "rojo",
    entrada_at: "2026-06-17T12:00:00.000Z",
    salida_at: null,
    observaciones: null,
    created_at: "2026-06-17T12:00:00.000Z",
    updated_at: "2026-06-17T12:00:00.000Z",
    visitante: "Visitante Test",
    documento: "30111222",
    empresa: "Empresa Test",
    has_foto: false,
    has_visita_foto: false,
    ...overrides,
  };
}

describe("VisitasService stale sync", () => {
  const repo = {
    findStaleCandidates: jest.fn(),
    markStaleWithoutCheckout: jest.fn(),
    getMetrics: jest.fn(),
  };
  const auditRepo = {
    create: jest.fn(),
  };
  const personasRepo = {};
  const motivosVisitaService = {};
  const usersService = {};
  const catalogService = {};

  let service: VisitasService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findStaleCandidates.mockResolvedValue([]);
    repo.markStaleWithoutCheckout.mockResolvedValue([]);
    repo.getMetrics.mockResolvedValue(makeMetricsRow());
    auditRepo.create.mockResolvedValue(undefined);

    service = new VisitasService(
      repo as never,
      auditRepo as never,
      personasRepo as never,
      motivosVisitaService as never,
      usersService as never,
      catalogService as never,
    );
  });

  it("ejecuta sync solo una vez por día en getMetrics", async () => {
    await service.getMetrics();
    await service.getMetrics();

    expect(repo.findStaleCandidates).toHaveBeenCalledTimes(1);
    expect(repo.markStaleWithoutCheckout).toHaveBeenCalledTimes(1);
    expect(repo.getMetrics).toHaveBeenCalledTimes(2);
    expect(auditRepo.create).not.toHaveBeenCalled();
  });

  it("registra auditoría con before/after distintos y changed_fields", async () => {
    const before = makeRow({
      id: "5",
      estado: "activa",
      updated_at: "2026-06-17T12:00:00.000Z",
    });
    const after = makeRow({
      id: "5",
      estado: "sin_salida",
      updated_at: "2026-06-18T08:00:00.000Z",
    });
    repo.findStaleCandidates.mockResolvedValue([before]);
    repo.markStaleWithoutCheckout.mockResolvedValue([after]);

    await service.getMetrics();

    expect(auditRepo.create).toHaveBeenCalledTimes(1);
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        visitaId: 5,
        actorUserId: 0,
        action: "visita.updated",
        metadata: { source: "daily_stale_sync" },
        beforeState: expect.objectContaining({ estado: "activa" }),
        afterState: expect.objectContaining({ estado: "sin_salida" }),
        changedFields: expect.arrayContaining(["estado", "updatedAt"]),
      }),
    );
  });

  it("no registra auditoría en el segundo getMetrics del mismo día", async () => {
    const before = makeRow({ id: "5", estado: "activa" });
    const after = makeRow({
      id: "5",
      estado: "sin_salida",
      updated_at: "2026-06-18T08:00:00.000Z",
    });
    repo.findStaleCandidates.mockResolvedValue([before]);
    repo.markStaleWithoutCheckout.mockResolvedValue([after]);

    await service.getMetrics();
    await service.getMetrics();

    expect(auditRepo.create).toHaveBeenCalledTimes(1);
    expect(repo.findStaleCandidates).toHaveBeenCalledTimes(1);
    expect(repo.markStaleWithoutCheckout).toHaveBeenCalledTimes(1);
  });
});

describe("VisitasService visita activa por día", () => {
  const repo = {
    findActiveByPersonaId: jest.fn(),
    findActiveByCredencialNumero: jest.fn(),
    create: jest.fn(),
  };
  const auditRepo = {
    create: jest.fn(),
  };
  const personasRepo = {
    findById: jest.fn(),
    updateUltimosVisita: jest.fn(),
  };
  const motivosVisitaService = {
    assertActiveMotivoVisita: jest.fn(),
  };
  const usersService = {
    findById: jest.fn(),
  };
  const catalogService = {};

  let service: VisitasService;

  const baseDto: CreateVisitaDto = {
    personaId: 10,
    motivoVisitaId: 3,
    responsableNombre: "Responsable Test",
    responsableId: 1,
    credencialNumero: "T-100",
    tarjetaColor: "rojo",
    estado: "activa",
    entradaAt: "2026-06-19T14:30:00.000Z",
  };

  function makePersona(): PersonaRow {
    return {
      id: "10",
      nombre: "Visitante Test",
      documento: "30111222",
      proveedor_id: "1",
      proveedor_nombre: "Empresa Test",
      proveedor_activo: true,
      email: null,
      telefono: null,
      activo: true,
      has_foto: false,
      ultimo_motivo: null,
      ultimo_responsable: null,
      created_at: "2026-06-17T12:00:00.000Z",
      updated_at: "2026-06-17T12:00:00.000Z",
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findActiveByPersonaId.mockResolvedValue(null);
    repo.findActiveByCredencialNumero.mockResolvedValue(null);
    repo.create.mockResolvedValue(makeRow({ entrada_at: baseDto.entradaAt ?? null }));
    auditRepo.create.mockResolvedValue(undefined);
    personasRepo.findById.mockResolvedValue(makePersona());
    personasRepo.updateUltimosVisita.mockResolvedValue(makePersona());
    motivosVisitaService.assertActiveMotivoVisita.mockResolvedValue({ id: 3, nombre: "Reunión" });
    usersService.findById.mockResolvedValue({
      id: 1,
      fullName: "Responsable Test",
      isActive: true,
      locationId: null,
    });

    service = new VisitasService(
      repo as never,
      auditRepo as never,
      personasRepo as never,
      motivosVisitaService as never,
      usersService as never,
      catalogService as never,
    );
  });

  it("permite crear visita hoy si la activa de ayer no cae en el mismo día", async () => {
    await service.create(1, baseDto);

    expect(repo.findActiveByPersonaId).toHaveBeenCalledWith(
      10,
      undefined,
      expect.any(Date),
      expect.any(Date),
    );

    const [, , dayStart, dayEnd] = repo.findActiveByPersonaId.mock.calls[0];
    const reference = new Date(baseDto.entradaAt!);
    const expectedStart = new Date(
      reference.getFullYear(),
      reference.getMonth(),
      reference.getDate(),
      0,
      0,
      0,
      0,
    );
    const expectedEnd = new Date(expectedStart);
    expectedEnd.setDate(expectedEnd.getDate() + 1);

    expect(dayStart).toEqual(expectedStart);
    expect(dayEnd).toEqual(expectedEnd);
    expect(repo.create).toHaveBeenCalled();
  });

  it("actualiza el último motivo y responsable de la persona al crear", async () => {
    await service.create(1, baseDto);

    expect(personasRepo.updateUltimosVisita).toHaveBeenCalledWith(10, {
      ultimoMotivo: 3,
      ultimoResponsable: 1,
    });
  });

  it("ignora visitas sin_salida y permite crear", async () => {
    repo.findActiveByPersonaId.mockResolvedValue(null);

    await expect(service.create(1, baseDto)).resolves.toBeDefined();
    expect(repo.create).toHaveBeenCalled();
  });

  it("bloquea crear visita si ya hay activa el mismo día", async () => {
    repo.findActiveByPersonaId.mockResolvedValue(makeRow({ id: "99" }));

    await expect(service.create(1, baseDto)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("bloquea crear visita sin número de tarjeta", async () => {
    await expect(service.create(1, { ...baseDto, credencialNumero: "   " })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "El número de tarjeta es obligatorio para crear una visita",
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("bloquea crear visita sin persona", async () => {
    await expect(service.create(1, { ...baseDto, personaId: 0 })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "La persona es obligatoria para crear una visita",
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("bloquea crear visita sin motivo", async () => {
    await expect(service.create(1, { ...baseDto, motivoVisitaId: 0 })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "El motivo es obligatorio para crear una visita",
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("bloquea crear visita sin responsable", async () => {
    await expect(service.create(1, { ...baseDto, responsableNombre: "   " })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "El responsable es obligatorio para crear una visita",
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("bloquea crear visita sin ID de responsable", async () => {
    await expect(service.create(1, { ...baseDto, responsableId: 0 })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "El responsable es obligatorio para crear una visita",
    });
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("VisitasService update close", () => {
  const repo = {
    findById: jest.fn(),
    update: jest.fn(),
  };
  const auditRepo = {
    create: jest.fn(),
  };

  let service: VisitasService;

  beforeEach(() => {
    jest.clearAllMocks();
    auditRepo.create.mockResolvedValue(undefined);

    service = new VisitasService(
      repo as never,
      auditRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it("actualiza salidaAt con la hora real al finalizar una visita activa", async () => {
    const current = makeRow({
      id: "7",
      estado: "activa",
      salida_at: "2026-06-19T18:00:00.000Z",
    });
    const updated = makeRow({
      id: "7",
      estado: "finalizada",
      salida_at: "2026-06-19T15:45:00.000Z",
      estado_seguimiento: null,
    });
    repo.findById.mockResolvedValueOnce(current).mockResolvedValueOnce(updated);
    repo.update.mockResolvedValue(updated);

    const before = Date.now();
    await service.update(3, 7, { estado: "finalizada" });
    const after = Date.now();

    expect(repo.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        estado: "finalizada",
        estadoSeguimiento: null,
        salidaAt: expect.any(Date),
      }),
    );
    const salidaAt = repo.update.mock.calls[0]?.[1]?.salidaAt as Date;
    expect(salidaAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(salidaAt.getTime()).toBeLessThanOrEqual(after);
  });
});

describe("VisitasService deletePermanent", () => {
  const repo = {
    findById: jest.fn(),
    update: jest.fn(),
    hardDelete: jest.fn(),
  };
  const auditRepo = {
    create: jest.fn(),
  };

  let service: VisitasService;

  beforeEach(() => {
    jest.clearAllMocks();
    auditRepo.create.mockResolvedValue(undefined);

    service = new VisitasService(
      repo as never,
      auditRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it("registra auditoría visita.deleted y elimina visitas finalizadas", async () => {
    const visita = makeRow({ id: "12", estado: "finalizada" });
    repo.findById.mockResolvedValue(visita);
    repo.hardDelete.mockResolvedValue({ id: "12" });

    const result = await service.deletePermanent(7, 12);

    expect(result).toEqual({ id: 12, deleted: true });
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        visitaId: 12,
        actorUserId: 7,
        action: "visita.deleted",
        beforeState: expect.objectContaining({ estado: "finalizada", visitante: "Visitante Test" }),
        afterState: null,
        changedFields: expect.arrayContaining(["estado", "visitante"]),
      }),
    );
    expect(repo.hardDelete).toHaveBeenCalledWith(12);
  });

  it("cancela visitas activas al eliminar y registra auditoría como visita.deleted", async () => {
    const visita = makeRow({ id: "8", estado: "activa" });
    const updated = makeRow({ id: "8", estado: "cancelada", estado_seguimiento: null });
    repo.findById.mockResolvedValue(visita);
    repo.update.mockResolvedValue(updated);

    const result = await service.deletePermanent(7, 8);

    expect(result).toEqual({ id: 8, cancelled: true });
    expect(repo.update).toHaveBeenCalledWith(8, {
      estado: "cancelada",
      estadoSeguimiento: null,
    });
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        visitaId: 8,
        actorUserId: 7,
        action: "visita.deleted",
        beforeState: expect.objectContaining({ estado: "activa" }),
        afterState: expect.objectContaining({ estado: "cancelada" }),
        changedFields: expect.arrayContaining(["estado"]),
      }),
    );
    expect(repo.hardDelete).not.toHaveBeenCalled();
  });
});

jest.mock("../personas/persona-photo.processor", () => ({
  processPersonaPhoto: jest.fn().mockResolvedValue({
    buffer: Buffer.from("processed-image"),
    mimeType: "image/jpeg",
  }),
}));

describe("VisitasService photo", () => {
  const repo = {
    findById: jest.fn(),
    updatePhoto: jest.fn(),
    findPhotoById: jest.fn(),
  };

  let service: VisitasService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findById.mockResolvedValue(makeRow());
    service = new VisitasService(
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it("getPhoto devuelve buffer cuando la visita tiene foto", async () => {
    repo.findPhotoById.mockResolvedValue({
      foto: Buffer.from("jpeg-data"),
      foto_mime_type: "image/jpeg",
    });

    const result = await service.getPhoto(1);

    expect(result.buffer).toEqual(Buffer.from("jpeg-data"));
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.size).toBe(Buffer.from("jpeg-data").length);
  });

  it("getPhoto lanza NOT_FOUND si no hay foto", async () => {
    repo.findPhotoById.mockResolvedValue(null);

    await expect(service.getPhoto(1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("setPhoto procesa y persiste la imagen", async () => {
    const updated = makeRow({ has_visita_foto: true });
    repo.updatePhoto.mockResolvedValue(updated);

    const result = await service.setPhoto(1, {
      buffer: Buffer.from("raw-image"),
      mimetype: "image/jpeg",
      originalname: "capture.jpg",
      size: 11,
    });

    expect(repo.updatePhoto).toHaveBeenCalledWith(1, Buffer.from("processed-image"), "image/jpeg");
    expect(result.hasVisitaFoto).toBe(true);
  });
});
