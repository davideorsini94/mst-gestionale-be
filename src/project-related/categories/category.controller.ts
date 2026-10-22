import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { Category, CategoryType } from './entities/category.entity';
import { RequireAnyCapability, RequireCapabilities } from '../../common/auth/decorators/capabilities.decorator';
import { Capability } from '../../common/models/capabilities-per-role/capability.enum';
import { StripProtectedFieldsPipe } from '../../common/pipes/strip-protected-fields.pipe';

/** Le categorie si leggono da Movimenti e Statistiche (select) oltre che dalla loro gestione. */
const READ_CATEGORIES = [
  Capability.CAN_VIEW_CATEGORIES,
  Capability.CAN_MANAGE_CATEGORIES,
  Capability.CAN_VIEW_TRANSACTIONS,
  Capability.CAN_MANAGE_TRANSACTIONS,
  Capability.CAN_VIEW_STATISTICS,
];

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @RequireAnyCapability(...READ_CATEGORIES)
  @ApiOperation({ summary: 'Lista categorie' })
  async findAll(@Query('filters') filters?: string) {
    return this.categoryService.findAndCountWithFilterList(filters, null);
  }

  @Get('search')
  @RequireAnyCapability(...READ_CATEGORIES)
  @ApiOperation({ summary: 'Ricerca categorie per autocomplete' })
  @ApiQuery({ name: 'q', required: false, description: 'Testo di ricerca' })
  @ApiQuery({ name: 'type', required: false, enum: CategoryType, description: 'Tipo categoria' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async search(
    @Query('q') q?: string,
    @Query('type') type?: CategoryType,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const [data, total] = await this.categoryService.searchCategories(
      q || '',
      type,
      parseInt(page) || 1,
      parseInt(pageSize) || 10,
    );
    return {
      data,
      total,
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 10,
      totalPages: Math.ceil(total / (parseInt(pageSize) || 10)),
    };
  }

  @Get(':uuid')
  @RequireAnyCapability(...READ_CATEGORIES)
  @ApiOperation({ summary: 'Dettaglio categoria' })
  async findOne(@Param('uuid') uuid: string) {
    return this.categoryService.findByUuid(uuid);
  }

  @Post()
  @RequireCapabilities(Capability.CAN_MANAGE_CATEGORIES)
  @ApiOperation({ summary: 'Crea categoria' })
  async create(@Body(new StripProtectedFieldsPipe()) category: Partial<Category>) {
    return this.categoryService.create(category as any);
  }

  @Put(':uuid')
  @RequireCapabilities(Capability.CAN_MANAGE_CATEGORIES)
  @ApiOperation({ summary: 'Aggiorna categoria' })
  async update(@Param('uuid') uuid: string, @Body(new StripProtectedFieldsPipe()) category: Partial<Category>) {
    return this.categoryService.update(uuid, category as any);
  }

  @Delete(':uuid')
  @RequireCapabilities(Capability.CAN_MANAGE_CATEGORIES)
  @ApiOperation({ summary: 'Elimina categoria' })
  async remove(@Param('uuid') uuid: string) {
    return this.categoryService.delete(uuid);
  }
}
