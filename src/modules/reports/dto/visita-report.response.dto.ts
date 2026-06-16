/**
 * @file visita-report.response.dto.ts
 * @description DTOs de respuesta del reporte superadmin de visitas de portería.
 */
import { ApiProperty } from "@nestjs/swagger";
import { VISITA_ESTADO, type VisitaEstado } from "../../visitas/domain/visita-estado";

/** Fila del reporte de visitas de portería. */
export class VisitaReportLogResponseDto {
  @ApiProperty({ nullable: true, example: "2026-06-10T14:30:00.000Z" })
  entradaAt!: string | null;

  @ApiProperty({ nullable: true, example: "2026-06-10T16:00:00.000Z" })
  salidaAt!: string | null;

  @ApiProperty({ example: "Maria Gonzalez" })
  visitante!: string;

  @ApiProperty({ example: "30.123.456" })
  documento!: string;

  @ApiProperty({ nullable: true, example: "Logistica Norte SA" })
  empresa!: string | null;

  @ApiProperty({ example: "Entrega de materiales" })
  motivo!: string;

  @ApiProperty({ example: "Juan Perez" })
  responsable!: string;

  @ApiProperty({ enum: VISITA_ESTADO, example: "finalizada" })
  estado!: VisitaEstado;

  @ApiProperty({ example: "Administración, Fábrica" })
  zonas!: string;

  @ApiProperty({ nullable: true, example: "Verde" })
  tarjeta!: string | null;

  @ApiProperty({ nullable: true, example: "T-1024" })
  credencial!: string | null;
}

/** Contenedor paginado del reporte de visitas. */
export class VisitaReportLogListResponseDto {
  @ApiProperty({ type: () => [VisitaReportLogResponseDto] })
  items!: VisitaReportLogResponseDto[];

  @ApiProperty({ example: 120 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 15 })
  limit!: number;
}
