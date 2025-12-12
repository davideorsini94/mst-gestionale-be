"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedRoles = seedRoles;
const data_source_1 = require("../datasources/data-source");
const role_entity_1 = require("../common/models/roles/entities/role.entity");
const capability_per_role_entity_1 = require("../common/models/capabilities-per-role/entities/capability-per-role.entity");
const capability_enum_1 = require("../common/models/capabilities-per-role/capability.enum");
const ALL_CAPS = Object.values(capability_enum_1.Capability).filter((v) => typeof v === 'string');
const ROLES_CONFIG = [
    {
        code: 'admin',
        description: 'Accesso completo a tutte le funzionalità',
        capabilities: ALL_CAPS,
    },
    {
        code: 'staff',
        description: 'Accesso alle funzionalità operative',
        capabilities: [
            capability_enum_1.Capability.CAN_VIEW_DASHBOARD,
            capability_enum_1.Capability.CAN_VIEW_MEMBERS,
            capability_enum_1.Capability.CAN_MANAGE_MEMBERS,
            capability_enum_1.Capability.CAN_VIEW_STAFF,
            capability_enum_1.Capability.CAN_VIEW_VEHICLES,
            capability_enum_1.Capability.CAN_VIEW_SETTINGS,
        ],
    },
    {
        code: 'user',
        description: 'Accesso base in sola lettura',
        capabilities: [
            capability_enum_1.Capability.CAN_VIEW_DASHBOARD,
            capability_enum_1.Capability.CAN_VIEW_MEMBERS,
            capability_enum_1.Capability.CAN_VIEW_STAFF,
            capability_enum_1.Capability.CAN_VIEW_VEHICLES,
        ],
    },
];
async function seedRoles() {
    const roleRepo = data_source_1.dataSource.getRepository(role_entity_1.Role);
    const capabilityRepo = data_source_1.dataSource.getRepository(capability_per_role_entity_1.CapabilityPerRole);
    for (const roleConfig of ROLES_CONFIG) {
        let role = await roleRepo.findOne({ where: { code: roleConfig.code } });
        if (!role) {
            role = roleRepo.create({
                code: roleConfig.code,
                description: roleConfig.description,
            });
            await roleRepo.save(role);
            console.log(`[Seed] Ruolo '${roleConfig.code}' creato`);
        }
        else {
            role.description = roleConfig.description;
            await roleRepo.save(role);
            console.log(`[Seed] Ruolo '${roleConfig.code}' aggiornato`);
        }
        await capabilityRepo.delete({ roleCode: roleConfig.code });
        for (const capability of roleConfig.capabilities) {
            const capEntity = capabilityRepo.create({
                roleCode: roleConfig.code,
                capability,
            });
            await capabilityRepo.save(capEntity);
        }
        console.log(`[Seed] ${roleConfig.capabilities.length} capabilities assegnate a '${roleConfig.code}'`);
    }
    console.log('[Seed] Seed ruoli completato');
}
//# sourceMappingURL=seed-roles.js.map