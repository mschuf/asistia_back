import { ApiProperty } from "@nestjs/swagger";
import type { TicketType } from "../../tickets/domain/ticket-type";

export class SendMailRequesterDto {
  @ApiProperty({ example: 1367, nullable: true })
  userId!: number | null;

  @ApiProperty({ example: "Carlos Hernán Morreira Urbieta" })
  name!: string;

  @ApiProperty({ example: "usuario@empresa.com" })
  email!: string;

  @ApiProperty({ example: "glpi", enum: ["glpi", "ldap"] })
  source!: "glpi" | "ldap";
}

export class SendMailCategoryDto {
  @ApiProperty({ example: 65 })
  id!: number;

  @ApiProperty({ example: "Software: Office, Windows, SAP, Aplicaciones" })
  name!: string;
}

export class SendMailResponseDto {
  @ApiProperty({ example: 4521 })
  ticketId!: number;

  @ApiProperty({ example: "Software: Office, Windows, SAP, Aplicaciones" })
  subject!: string;

  @ApiProperty({ enum: ["incident", "request"], example: "request" })
  type!: TicketType;

  @ApiProperty({ example: true })
  sent!: boolean;

  @ApiProperty({ example: null, nullable: true })
  error!: string | null;

  @ApiProperty({ type: () => SendMailRequesterDto })
  requester!: SendMailRequesterDto;

  @ApiProperty({ type: () => SendMailCategoryDto })
  category!: SendMailCategoryDto;

  @ApiProperty({
    example: { sent: true, error: null },
    description: "Resultado de envío de correos de ticket creado.",
  })
  mail!: { sent: boolean; error: string | null };

  @ApiProperty({
    type: [String],
    example: ["Solicitante no vinculado en GLPI; ticket creado sin solicitante."],
  })
  warnings!: string[];

  @ApiProperty({ example: true })
  userMailSent!: boolean;

  @ApiProperty({ example: true })
  supportMailSent!: boolean;
}
