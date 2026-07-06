import { existsSync } from "fs";
import { mkdtemp, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { ErsDocumentsService } from "./ers-documents.service";

describe("ErsDocumentsService", () => {
  const config = { get: jest.fn(() => 50 * 1024 * 1024) };
  const repository = {
    findProjectEntity: jest.fn(),
    findLinkedDocument: jest.fn(),
    list: jest.fn(),
  };
  const glpi = { request: jest.fn() };
  const bootstrap = { withCatalogBootstrapSession: jest.fn() };
  const history = { registerEvent: jest.fn() };
  const service = new ErsDocumentsService(
    config as never,
    repository as never,
    glpi as never,
    bootstrap as never,
    history as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("impide descargar un documento no vinculado al proyecto", async () => {
    repository.findProjectEntity.mockResolvedValue(0);
    repository.findLinkedDocument.mockResolvedValue(null);

    await expect(service.content(10, 99)).rejects.toMatchObject({ status: 404 });
    expect(bootstrap.withCatalogBootstrapSession).not.toHaveBeenCalled();
  });

  it("sube mediante GLPI y elimina siempre el archivo temporal", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ers-doc-"));
    const path = join(directory, "archivo.txt");
    await writeFile(path, "hola");
    repository.findProjectEntity.mockResolvedValue(0);
    repository.findLinkedDocument.mockResolvedValue({ id: 7, name: "archivo.txt", mimeType: "text/plain", createdAt: null });
    glpi.request.mockResolvedValue({ data: { id: 7 } });
    bootstrap.withCatalogBootstrapSession.mockImplementation((callback: (key: string) => unknown) => callback("session"));

    await expect(service.upload(10, {
      originalname: "archivo.txt",
      mimetype: "text/plain",
      size: 4,
      path,
    }, 25)).resolves.toMatchObject({ id: 7 });

    expect(glpi.request).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "Document", multipart: true }));
    expect(history.registerEvent).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 10,
      actionType: "create",
      actorUserId: 25,
      metadata: { documentId: 7, documentName: "archivo.txt" },
    }));
    expect(existsSync(path)).toBe(false);
  });

  it("elimina definitivamente en GLPI un documento vinculado al proyecto", async () => {
    repository.findProjectEntity.mockResolvedValue(0);
    repository.findLinkedDocument.mockResolvedValue({ id: 7, name: "archivo.txt", mimeType: "text/plain", createdAt: null });
    bootstrap.withCatalogBootstrapSession.mockImplementation((callback: (key: string) => unknown) => callback("session"));
    glpi.request.mockResolvedValue({ data: true });

    await expect(service.delete(10, 7, 25)).resolves.toBeUndefined();

    expect(glpi.request).toHaveBeenCalledWith({
      method: "DELETE",
      path: "Document/7",
      query: { force_purge: true },
      sessionKey: "session",
      retry: false,
    });
    expect(history.registerEvent).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 10,
      actionType: "delete",
      actorUserId: 25,
      metadata: { documentId: 7, documentName: "archivo.txt" },
    }));
  });

  it("impide eliminar un documento no vinculado al proyecto", async () => {
    repository.findProjectEntity.mockResolvedValue(0);
    repository.findLinkedDocument.mockResolvedValue(null);

    await expect(service.delete(10, 99, 25)).rejects.toMatchObject({ status: 404 });
    expect(bootstrap.withCatalogBootstrapSession).not.toHaveBeenCalled();
    expect(history.registerEvent).not.toHaveBeenCalled();
  });
});
