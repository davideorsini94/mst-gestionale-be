import { Injectable } from '@nestjs/common';
import { dataSource } from '../../datasources/data-source';
import { Settings } from './entities/settings.entity';

@Injectable()
export class SettingsService {
  private repo = dataSource.getRepository(Settings);

  async findAll(): Promise<Settings[]> {
    return this.repo.find();
  }

  async findByKey(key: string): Promise<Settings | null> {
    return this.repo.findOne({ where: { key } });
  }

  async upsert(key: string, value: any, description?: string): Promise<Settings> {
    let settings = await this.findByKey(key);
    
    if (settings) {
      settings.value = value;
      if (description) settings.description = description;
    } else {
      settings = this.repo.create({ key, value, description });
    }
    
    return this.repo.save(settings);
  }

  async delete(key: string): Promise<void> {
    await this.repo.delete({ key });
  }
}
