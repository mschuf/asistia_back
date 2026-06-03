import { ApiProperty } from "@nestjs/swagger";

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
  @ApiProperty({ example: true })
  sent!: boolean;

  @ApiProperty({ example: null, nullable: true })
  error!: string | null;

  @ApiProperty({ type: () => SendMailRequesterDto })
  requester!: SendMailRequesterDto;

  @ApiProperty({ type: () => SendMailCategoryDto })
  category!: SendMailCategoryDto;

  @ApiProperty({ example: true })
  userMailSent!: boolean;

  @ApiProperty({ example: true })
  supportMailSent!: boolean;
}
