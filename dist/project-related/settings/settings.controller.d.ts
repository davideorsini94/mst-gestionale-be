import { SettingsService } from './settings.service';
export declare class SettingsController {
    private readonly settingsService;
    constructor(settingsService: SettingsService);
    findAll(): Promise<import("./entities/settings.entity").Settings[]>;
    findOne(key: string): Promise<import("./entities/settings.entity").Settings>;
    upsert(body: {
        key: string;
        value: any;
        description?: string;
    }): Promise<import("./entities/settings.entity").Settings>;
    remove(key: string): Promise<void>;
}
