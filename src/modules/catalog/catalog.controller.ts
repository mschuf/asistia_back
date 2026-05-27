import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { CatalogService } from "./catalog.service";
import { CategoryResponseDto } from "./dto/category.response.dto";
import { LocationResponseDto } from "./dto/location.response.dto";
import { GroupResponseDto } from "./dto/group.response.dto";

@ApiTags("catalog")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("categories")
  @ApiOperation({ summary: "List ITIL categories (cached)" })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  @ResponseMessage("Categories retrieved")
  async categories(): Promise<CategoryResponseDto[]> {
    return this.catalog.listCategories();
  }

  @Get("locations")
  @ApiOperation({ summary: "List locations (cached)" })
  @ApiResponse({ status: 200, type: [LocationResponseDto] })
  @ResponseMessage("Locations retrieved")
  async locations(): Promise<LocationResponseDto[]> {
    return this.catalog.listLocations();
  }

  @Get("groups")
  @ApiOperation({ summary: "List groups (cached)" })
  @ApiResponse({ status: 200, type: [GroupResponseDto] })
  @ResponseMessage("Groups retrieved")
  async groups(): Promise<GroupResponseDto[]> {
    return this.catalog.listGroups();
  }
}
