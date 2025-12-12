import { dataSource } from '../datasources/data-source';
import { Role } from '../common/models/roles/entities/role.entity';
import { CapabilityPerRole } from '../common/models/capabilities-per-role/entities/capability-per-role.entity';
import { Capability } from '../common/models/capabilities-per-role/capability.enum';

// Tutte le capabilities (solo stringhe, non valori numerici)
const ALL_CAPS = Object.values(Capability).filter(
  (v) => typeof v === 'string',
) as Capability[];

// Definizione dei 3 ruoli con le loro capabilities
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
      Capability.CAN_VIEW_DASHBOARD,
      Capability.CAN_VIEW_MEMBERS,
      Capability.CAN_MANAGE_MEMBERS,
      Capability.CAN_VIEW_STAFF,
      Capability.CAN_VIEW_VEHICLES,
      Capability.CAN_VIEW_SETTINGS,
    ],
  },
  {
    code: 'user',
    description: 'Accesso base in sola lettura',
    capabilities: [
      Capability.CAN_VIEW_DASHBOARD,
      Capability.CAN_VIEW_MEMBERS,
      Capability.CAN_VIEW_STAFF,
      Capability.CAN_VIEW_VEHICLES,
    ],
  },
];

export async function seedRoles(): Promise<void> {
  const roleRepo = dataSource.getRepository(Role);
  const capabilityRepo = dataSource.getRepository(CapabilityPerRole);

  for (const roleConfig of ROLES_CONFIG) {
    // Verifica se il ruolo esiste già
    let role = await roleRepo.findOne({ where: { code: roleConfig.code } });

    if (!role) {
      // Crea il ruolo
      role = roleRepo.create({
        code: roleConfig.code,
        description: roleConfig.description,
      });
      await roleRepo.save(role);
      console.log(`[Seed] Ruolo '${roleConfig.code}' creato`);
    } else {
      // Aggiorna il ruolo esistente
      role.description = roleConfig.description;
      await roleRepo.save(role);
      console.log(`[Seed] Ruolo '${roleConfig.code}' aggiornato`);
    }

    // Elimina le capabilities esistenti per questo ruolo
    await capabilityRepo.delete({ roleCode: roleConfig.code });

    // Crea le nuove capabilities
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
