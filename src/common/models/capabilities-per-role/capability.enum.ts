export enum Capability {
  // Gestione utenti e ruoli
  CAN_MANAGE_USERS = 'CAN_MANAGE_USERS',
  CAN_VIEW_USERS = 'CAN_VIEW_USERS',
  CAN_MANAGE_ROLES = 'CAN_MANAGE_ROLES',
  CAN_MANAGE_CAPABILITIES = 'CAN_MANAGE_CAPABILITIES',
  
  // Gestione tesserati
  CAN_MANAGE_MEMBERS = 'CAN_MANAGE_MEMBERS',
  CAN_VIEW_MEMBERS = 'CAN_VIEW_MEMBERS',
  
  // Gestione staff
  CAN_MANAGE_STAFF = 'CAN_MANAGE_STAFF',
  CAN_VIEW_STAFF = 'CAN_VIEW_STAFF',
  
  // Gestione transazioni finanziarie
  CAN_MANAGE_TRANSACTIONS = 'CAN_MANAGE_TRANSACTIONS',
  CAN_VIEW_TRANSACTIONS = 'CAN_VIEW_TRANSACTIONS',
  CAN_VIEW_STATISTICS = 'CAN_VIEW_STATISTICS',
  
  // Gestione veicoli
  CAN_MANAGE_VEHICLES = 'CAN_MANAGE_VEHICLES',
  CAN_VIEW_VEHICLES = 'CAN_VIEW_VEHICLES',
  
  // Gestione categorie
  CAN_MANAGE_CATEGORIES = 'CAN_MANAGE_CATEGORIES',
  CAN_VIEW_CATEGORIES = 'CAN_VIEW_CATEGORIES',
  
  // Impostazioni
  CAN_MANAGE_SETTINGS = 'CAN_MANAGE_SETTINGS',
  CAN_VIEW_SETTINGS = 'CAN_VIEW_SETTINGS',
  
  // Backup e Restore
  CAN_MANAGE_BACKUP = 'CAN_MANAGE_BACKUP',
  
  // Dashboard
  CAN_VIEW_DASHBOARD = 'CAN_VIEW_DASHBOARD',
}

// Lista di tutte le capabilities
export const ALL_CAPABILITIES = Object.values(Capability).filter(
  (value) => typeof value === 'string',
);

/** Codice del ruolo amministratore. */
export const ADMIN_ROLE_CODE = 'admin';

/**
 * Permessi su tutto ciò che riguarda i soldi (movimenti e ricevute, statistiche, voci di bilancio) e sui backup
 * (che contengono anche i dati contabili): riservati al ruolo admin. Non si assegnano ad altri ruoli e, se un
 * ruolo li avesse comunque nel DB, non valgono.
 */
export const ADMIN_ONLY_CAPABILITIES: readonly string[] = [
  Capability.CAN_VIEW_TRANSACTIONS,
  Capability.CAN_MANAGE_TRANSACTIONS,
  Capability.CAN_VIEW_STATISTICS,
  Capability.CAN_VIEW_CATEGORIES,
  Capability.CAN_MANAGE_CATEGORIES,
  Capability.CAN_MANAGE_BACKUP,
];

export const isAdminOnlyCapability = (capability: string) => ADMIN_ONLY_CAPABILITIES.includes(capability);

/**
 * Toglie i permessi riservati all'admin dal ruolo caricato di un utente non admin (modifica l'oggetto): guardie,
 * login e /auth/me vedono così solo i permessi che valgono davvero.
 */
export function restrictRoleCapabilities<T extends { code?: string; capabilities?: { capability: string }[] } | null | undefined>(
  role: T,
): T {
  if (role && role.code !== ADMIN_ROLE_CODE && Array.isArray(role.capabilities)) {
    role.capabilities = role.capabilities.filter((c) => !isAdminOnlyCapability(c.capability));
  }
  return role;
}
