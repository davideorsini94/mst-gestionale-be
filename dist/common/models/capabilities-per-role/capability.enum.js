"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_CAPABILITIES = exports.Capability = void 0;
var Capability;
(function (Capability) {
    Capability["CAN_MANAGE_USERS"] = "CAN_MANAGE_USERS";
    Capability["CAN_VIEW_USERS"] = "CAN_VIEW_USERS";
    Capability["CAN_MANAGE_ROLES"] = "CAN_MANAGE_ROLES";
    Capability["CAN_MANAGE_CAPABILITIES"] = "CAN_MANAGE_CAPABILITIES";
    Capability["CAN_MANAGE_MEMBERS"] = "CAN_MANAGE_MEMBERS";
    Capability["CAN_VIEW_MEMBERS"] = "CAN_VIEW_MEMBERS";
    Capability["CAN_MANAGE_STAFF"] = "CAN_MANAGE_STAFF";
    Capability["CAN_VIEW_STAFF"] = "CAN_VIEW_STAFF";
    Capability["CAN_MANAGE_TRANSACTIONS"] = "CAN_MANAGE_TRANSACTIONS";
    Capability["CAN_VIEW_TRANSACTIONS"] = "CAN_VIEW_TRANSACTIONS";
    Capability["CAN_VIEW_STATISTICS"] = "CAN_VIEW_STATISTICS";
    Capability["CAN_MANAGE_VEHICLES"] = "CAN_MANAGE_VEHICLES";
    Capability["CAN_VIEW_VEHICLES"] = "CAN_VIEW_VEHICLES";
    Capability["CAN_MANAGE_CATEGORIES"] = "CAN_MANAGE_CATEGORIES";
    Capability["CAN_VIEW_CATEGORIES"] = "CAN_VIEW_CATEGORIES";
    Capability["CAN_MANAGE_SETTINGS"] = "CAN_MANAGE_SETTINGS";
    Capability["CAN_VIEW_SETTINGS"] = "CAN_VIEW_SETTINGS";
    Capability["CAN_VIEW_DASHBOARD"] = "CAN_VIEW_DASHBOARD";
})(Capability || (exports.Capability = Capability = {}));
exports.ALL_CAPABILITIES = Object.values(Capability).filter((value) => typeof value === 'string');
//# sourceMappingURL=capability.enum.js.map