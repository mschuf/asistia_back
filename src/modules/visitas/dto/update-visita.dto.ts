/**
 * @file update-visita.dto.ts
 * @description DTO de validación para actualización parcial de una visita.
 */
import { PartialType } from "@nestjs/swagger";
import { CreateVisitaDto } from "./create-visita.dto";

/** Cuerpo HTTP para actualizar una visita existente. */
export class UpdateVisitaDto extends PartialType(CreateVisitaDto) {}
