import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService } from '../../common/base-crud/base.service';
import { Category, CategoryType } from './entities/category.entity';
import { BaseSaveDto } from '../../common/base-crud/base-save.dto';
import { FindOptionsOrder, ILike } from 'typeorm';

/** Escape di %, _ e \ per LIKE/ILIKE: nel testo cercato sono caratteri normali, non jolly. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

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
      // Ricerca case-insensitive con LOWER(); "%" e "_" scritti dall'utente cercano sé stessi
      qb.andWhere(`LOWER(category.name) LIKE LOWER(:search) ESCAPE '\\'`, { search: `%${escapeLike(search)}%` });
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
    // Cerca categoria esistente (case insensitive). Escape: con "50%" o "a_b" ILIKE trovava anche altre categorie.
    // (Postgres usa "\" come carattere di escape predefinito di LIKE/ILIKE.)
    let category = await this.repo.findOne({
      where: { name: ILike(escapeLike(name.trim())) },
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

  /** Una categoria usata da movimenti non si cancella (il vincolo del DB darebbe un errore generico). */
  async delete(uuid: string): Promise<Category> {
    const [{ count }] = await this.repo.query(
      `SELECT count(*)::int AS count FROM transactions WHERE "categoryUuid" = $1`,
      [uuid],
    );
    if (count > 0) {
      throw new BadRequestException(
        `La categoria è usata da ${count} moviment${count === 1 ? 'o' : 'i'}: assegna loro un'altra categoria o disattivala`,
      );
    }
    return super.delete(uuid);
  }
}
