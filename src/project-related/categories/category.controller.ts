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

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @ApiOperation({ summary: 'Lista categorie' })
  async findAll(@Query('filters') filters?: string) {
    return this.categoryService.findAndCountWithFilterList(filters, null);
  }

  @Get('search')
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
  @ApiOperation({ summary: 'Dettaglio categoria' })
  async findOne(@Param('uuid') uuid: string) {
    return this.categoryService.findByUuid(uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Crea categoria' })
  async create(@Body() category: Partial<Category>) {
    return this.categoryService.create(category as any);
  }

  @Put(':uuid')
  @ApiOperation({ summary: 'Aggiorna categoria' })
  async update(@Param('uuid') uuid: string, @Body() category: Partial<Category>) {
    return this.categoryService.update(uuid, category as any);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Elimina categoria' })
  async remove(@Param('uuid') uuid: string) {
    return this.categoryService.delete(uuid);
  }
}
