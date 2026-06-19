/**
 * @file update-motivo-visita.dto.ts
 * @description DTO de validación para actualización parcial de un motivo de visita.
 */
import { PartialType } from "@nestjs/swagger";
import { CreateMotivoVisitaDto } from "./create-motivo-visita.dto";

/** Cuerpo HTTP para actualizar un motivo de visita. */
export class UpdateMotivoVisitaDto extends PartialType(CreateMotivoVisitaDto) {}
