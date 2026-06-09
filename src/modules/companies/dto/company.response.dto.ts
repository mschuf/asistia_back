import { ApiProperty } from "@nestjs/swagger";

export class CompanyResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: "Pettengill" })
  name!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: "00000000-0000-0000-0000-000000000001" })
  msTenantId!: string;

  @ApiProperty({ example: "00000000-0000-0000-0000-000000000002" })
  msClientId!: string;

  @ApiProperty({ example: true })
  hasClientSecret!: boolean;

  @ApiProperty({ nullable: true, example: "••••••••" })
  clientSecretMasked!: string | null;

  @ApiProperty({ example: "soporte@empresa.com" })
  msMailbox!: string;

  @ApiProperty({ example: "inbox" })
  msMailFolder!: string;

  @ApiProperty({ example: "gemini-3-flash-preview" })
  geminiModel!: string;

  @ApiProperty({ example: 20 })
  daemonMaxEmails!: number;

  @ApiProperty({ example: 60 })
  daemonIntervalSeconds!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class CompanyListResponseDto {
  @ApiProperty({ type: () => [CompanyResponseDto] })
  items!: CompanyResponseDto[];

  @ApiProperty({ example: 1 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
