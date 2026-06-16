/**
 * @file update-persona.dto.ts
 * @description DTO de validación para actualización parcial de una persona.
 */
import { PartialType } from "@nestjs/swagger";
import { CreatePersonaDto } from "./create-persona.dto";

/** Cuerpo HTTP para actualizar una persona existente. */
export class UpdatePersonaDto extends PartialType(CreatePersonaDto) {}
