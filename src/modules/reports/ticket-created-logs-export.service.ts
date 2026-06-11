/**
 * @file ticket-created-logs-export.service.ts
 * @description Generación de archivos PDF y Excel del reporte ticket.created.
 */
import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { ExportTicketCreatedLogsQueryDto } from "./dto/export-ticket-created-logs-query.dto";
import { mapTicketCreatedLogRowToResponse } from "./mappers/ticket-created-log.mapper";
import { TicketCreatedLogsSqlRepository } from "./repositories/ticket-created-logs.sql-repository";
import type { TicketCreatedLogExportResult, TicketCreatedLogRow } from "./reports.types";

const EXPORT_HEADERS = [
  "Fecha creación",
  "Empresa",
  "Asunto",
  "Remitente",
  "Solicitante",
  "Tipo",
  "Categoría",
  "Correo enviado",
  "HTTP status",
] as const;

const TYPE_LABELS: Record<string, string> = {
  incident: "Incidente",
  request: "Solicitud",
};

const PDF_COLUMNS: Array<{ label: string; width: number }> = [
  { label: "Fecha creación", width: 68 },
  { label: "Empresa", width: 56 },
  { label: "Asunto", width: 108 },
  { label: "Remitente", width: 102 },
  { label: "Solicitante", width: 102 },
  { label: "Tipo", width: 46 },
  { label: "Categoría", width: 128 },
  { label: "Correo env.", width: 40 },
  { label: "HTTP", width: 30 },
];

const PDF_TABLE_WIDTH = PDF_COLUMNS.reduce((sum, column) => sum + column.width, 0);
const PDF_CELL_PADDING_X = 3;
const PDF_CELL_PADDING_Y = 4;
const PDF_ROW_GAP = 2;

/** Servicio de exportación PDF/Excel del reporte ticket.created. */
@Injectable()
export class TicketCreatedLogsExportService {
  /**
   * Inyecta el repositorio SQL de logs.
   * @param repo - Repositorio Postgres del reporte.
   */
  constructor(private readonly repo: TicketCreatedLogsSqlRepository) {}

  /**
   * Genera archivo PDF o Excel según filtros de consulta.
   * @param query - Filtros y formato de exportación.
   * @returns Buffer, nombre de archivo y MIME type.
   */
  async export(query: ExportTicketCreatedLogsQueryDto): Promise<TicketCreatedLogExportResult> {
    const { items, total } = await this.repo.findAllForExport({
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      categoryName: query.categoryName,
      companyId: query.companyId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const rows = items.map((row) => this.toExportRow(row));
    const stamp = this.buildFilenameStamp();

    if (query.format === "xlsx") {
      return {
        buffer: await this.buildExcel(rows, total),
        filename: `tickets-creados-${stamp}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    }

    return {
      buffer: await this.buildPdf(rows, total),
      filename: `tickets-creados-${stamp}.pdf`,
      mimeType: "application/pdf",
    };
  }

  /**
   * Convierte fila SQL en arreglo de celdas para exportación.
   * @param row - Fila cruda Postgres.
   * @returns Valores ordenados para PDF/Excel.
   */
  private toExportRow(row: TicketCreatedLogRow): string[] {
    const mapped = mapTicketCreatedLogRowToResponse(row);
    return [
      this.formatDateTime(mapped.createdAt),
      mapped.company,
      mapped.subject ?? "",
      mapped.fromAddress ?? "",
      mapped.requesterEmail ?? "",
      this.formatType(mapped.type),
      mapped.category ?? "",
      mapped.mailSent ?? "",
      mapped.httpStatus ?? "",
    ];
  }

  /**
   * @param value - Fecha ISO. @returns Fecha y hora legible en es-PY.
   */
  private formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("es-PY", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  /**
   * @param value - Tipo crudo. @returns Etiqueta legible.
   */
  private formatType(value: string | null): string {
    if (!value) return "";
    return TYPE_LABELS[value] ?? value;
  }

  /**
   * @returns Sello de fecha para nombre de archivo.
   */
  private buildFilenameStamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${year}${month}${day}-${hours}${minutes}`;
  }

  /**
   * Genera workbook Excel con filas y total al final.
   * @param rows - Filas exportables.
   * @param total - Total de registros que coinciden con filtros.
   * @returns Buffer XLSX.
   */
  private async buildExcel(rows: string[][], total: number): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tickets creados");

    sheet.addRow([...EXPORT_HEADERS]);
    sheet.getRow(1).font = { bold: true };

    for (const row of rows) {
      sheet.addRow(row);
    }

    sheet.addRow([]);
    const totalRow = sheet.addRow(["Total registros", total]);
    totalRow.font = { bold: true };

    sheet.columns = [
      { width: 20 },
      { width: 22 },
      { width: 36 },
      { width: 28 },
      { width: 28 },
      { width: 14 },
      { width: 30 },
      { width: 14 },
      { width: 12 },
    ];

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Genera PDF landscape con tabla y total al final.
   * @param rows - Filas exportables.
   * @param total - Total de registros que coinciden con filtros.
   * @returns Buffer PDF.
   */
  private async buildPdf(rows: string[][], total: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 36,
        size: "A4",
        layout: "landscape",
      });
      const chunks: Buffer[] = [];
      const headers = PDF_COLUMNS.map((column) => column.label);

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(14).text("Tickets creados por IA", { align: "center" });
      doc.moveDown(0.5);

      const left = doc.page.margins.left;
      const bottomLimit = doc.page.height - doc.page.margins.bottom - 28;
      let y = doc.y;

      const drawHeader = (): void => {
        y = this.drawPdfTableRow(doc, left, y, headers, true);
      };

      drawHeader();

      for (const row of rows) {
        const rowHeight = this.measurePdfRowHeight(doc, row, "Helvetica", 6);
        if (y + rowHeight > bottomLimit) {
          doc.addPage({ size: "A4", layout: "landscape", margin: 36 });
          y = doc.page.margins.top;
          drawHeader();
        }
        y = this.drawPdfTableRow(doc, left, y, row, false);
      }

      if (y + 20 > bottomLimit) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 36 });
        y = doc.page.margins.top;
      }

      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#000000")
        .text(`Total registros: ${total}`, left, y + 10);
      doc.end();
    });
  }

  /**
   * Calcula alto de fila según el texto más alto de cada celda.
   * @param doc - Documento PDF.
   * @param values - Valores de celda.
   * @param font - Fuente activa.
   * @param fontSize - Tamaño de fuente.
   * @returns Alto total de la fila.
   */
  private measurePdfRowHeight(
    doc: PDFKit.PDFDocument,
    values: string[],
    font: string,
    fontSize: number,
  ): number {
    doc.font(font).fontSize(fontSize);

    let rowHeight = fontSize + PDF_CELL_PADDING_Y * 2;
    for (let index = 0; index < PDF_COLUMNS.length; index += 1) {
      const colWidth = PDF_COLUMNS[index]?.width ?? 60;
      const textWidth = colWidth - PDF_CELL_PADDING_X * 2;
      const text = values[index] ?? "";
      const cellHeight = doc.heightOfString(text, { width: textWidth, lineGap: 1 });
      const total = cellHeight + PDF_CELL_PADDING_Y * 2;
      if (total > rowHeight) rowHeight = total;
    }

    return rowHeight + PDF_ROW_GAP;
  }

  /**
   * Dibuja una fila de tabla PDF con alto dinámico por contenido.
   * @param doc - Documento PDF.
   * @param left - Margen izquierdo.
   * @param y - Posición vertical inicial.
   * @param values - Valores de celda.
   * @param isHeader - Si es fila de cabecera.
   * @returns Nueva posición vertical.
   */
  private drawPdfTableRow(
    doc: PDFKit.PDFDocument,
    left: number,
    y: number,
    values: string[],
    isHeader: boolean,
  ): number {
    const font = isHeader ? "Helvetica-Bold" : "Helvetica";
    const fontSize = isHeader ? 7 : 6;
    const rowHeight = this.measurePdfRowHeight(doc, values, font, fontSize);

    if (isHeader) {
      doc.rect(left, y, PDF_TABLE_WIDTH, rowHeight - PDF_ROW_GAP).fill("#f3f4f6");
      doc.fillColor("#000000");
    }

    let x = left;
    doc.font(font).fontSize(fontSize);

    for (let index = 0; index < PDF_COLUMNS.length; index += 1) {
      const colWidth = PDF_COLUMNS[index]?.width ?? 60;
      const text = values[index] ?? "";
      doc.text(text, x + PDF_CELL_PADDING_X, y + PDF_CELL_PADDING_Y, {
        width: colWidth - PDF_CELL_PADDING_X * 2,
        lineGap: 1,
        align: "left",
      });
      x += colWidth;
    }

    doc
      .moveTo(left, y + rowHeight - PDF_ROW_GAP)
      .lineTo(left + PDF_TABLE_WIDTH, y + rowHeight - PDF_ROW_GAP)
      .strokeColor("#d1d5db")
      .lineWidth(0.5)
      .stroke();

    return y + rowHeight;
  }
}
