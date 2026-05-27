import { ApiProperty } from "@nestjs/swagger";

export class MeResponseDto {
  @ApiProperty({ example: 188 })
  id!: number;

  @ApiProperty({ example: "jdoe" })
  login!: string;

  @ApiProperty({ example: "Juan P├®rez" })
  name!: string;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ enum: ["final_user", "technician"], example: "technician" })
  role!: "final_user" | "technician";

  @ApiProperty({ type: () => Number, isArray: true, example: [4, 7] })
  groupIds!: number[];

  @ApiProperty({ nullable: true, example: 12 })
  locationId!: number | null;

  @ApiProperty({ nullable: true, example: 1 })
  entityId!: number | null;

  @ApiProperty({ nullable: true, example: "Holding > Empresa Principal" })
  entityName!: string | null;
}
