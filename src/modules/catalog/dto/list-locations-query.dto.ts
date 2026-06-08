import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

export class ListLocationsQueryDto {
  @ApiPropertyOptional({
    description: "When true, only locations with at least one active GLPI user.",
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => ["true", "1", "yes", true].includes(value))
  @IsBoolean()
  activeOnly?: boolean;
}
