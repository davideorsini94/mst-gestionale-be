import { Settings } from './entities/settings.entity';
export declare class SettingsService {
    private repo;
    findAll(): Promise<Settings[]>;
    findByKey(key: string): Promise<Settings | null>;
    upsert(key: string, value: any, description?: string): Promise<Settings>;
    delete(key: string): Promise<void>;
}
