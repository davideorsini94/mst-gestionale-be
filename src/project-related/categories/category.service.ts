import { Injectable } from '@nestjs/common';
import { BaseService } from '../../common/base-crud/base.service';
import { Category, CategoryType } from './entities/category.entity';
import { BaseSaveDto } from '../../common/base-crud/base-save.dto';
import { FindOptionsOrder, ILike } from 'typeorm';

@Injectable()
export class CategoryService extends BaseService<Category, BaseSaveDto, BaseSaveDto> {
  constructor() {
    super(Category);
  }

  protected getDefaultOrder(): FindOptionsOrder<Category> {
    return { sortOrder: 'ASC', name: 'ASC' };
  }

  /**
   * Ricerca categorie per autocomplete con paginazione
   * La ricerca è case-insensitive usando ILike
   * Le categorie di tipo BOTH appaiono sempre
   */
  async searchCategories(
    search: string,
    type?: CategoryType,
    page = 1,
    pageSize = 10,
  ): Promise<[Category[], number]> {
    const qb = this.repo.createQueryBuilder('category')
      .where('category.isActive = :isActive', { isActive: true });
    
    if (search) {
      // Ricerca case-insensitive con LOWER()
      qb.andWhere('LOWER(category.name) LIKE LOWER(:search)', { search: `%${search}%` });
    }
    
    // Se specificato un tipo, mostra categorie di quel tipo O di tipo BOTH
    if (type && type !== CategoryType.BOTH) {
      qb.andWhere('(category.type = :type OR category.type = :both)', { 
        type, 
        both: CategoryType.BOTH 
      });
    }

    qb.orderBy('category.sortOrder', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    return qb.getManyAndCount();
  }

  /**
   * Trova o crea una categoria per nome
   */
  async findOrCreateByName(name: string, type: CategoryType = CategoryType.BOTH): Promise<Category> {
    // Cerca categoria esistente (case insensitive)
    let category = await this.repo.findOne({
      where: { name: ILike(name.trim()) },
    });

    if (!category) {
      // Crea nuova categoria
      category = this.repo.create({
        name: name.trim(),
        type,
        isActive: true,
      });
      category = await this.repo.save(category);
    }

    return category;
  }
}
