import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListErsEligibleTicketsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  declare limit?: number;

  @ApiPropertyOptional({ description: 'Busca por ID, título, solicitante o sede' })
  @IsOptional()
  @IsString()
  search?: string;
}
