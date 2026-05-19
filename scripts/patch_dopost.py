"""Insert 6 new doPost cases after migrateToSupabase line."""
import sys

OLD = "      case 'migrateToSupabase': return jsonOk(handleMigrateToSupabase(body));\n"
NEW = (
    "      case 'migrateToSupabase': return jsonOk(handleMigrateToSupabase(body));\n"
    "      case 'adminGetSlots':         return jsonOk(handleAdminGetSlotsV2(body));\n"
    "      case 'adminAddSlot':          return jsonOk(handleAdminAddSlotV2(body));\n"
    "      case 'adminDeleteSlot':       return jsonOk(handleAdminDeleteSlotV2(body));\n"
    "      case 'adminToggleSlot':       return jsonOk(handleAdminToggleSlotV2(body));\n"
    "      case 'adminGetClients':       return jsonOk(handleAdminGetClientsV2(body));\n"
    "      case 'adminGetClientHistory': return jsonOk(handleAdminGetClientHistoryV2(body));\n"
)

path = 'backend/gas-backend.js'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

if OLD not in src:
    print('ERROR: anchor not found')
    sys.exit(1)
if src.count(OLD) != 1:
    print('ERROR: anchor found multiple times')
    sys.exit(1)

result = src.replace(OLD, NEW, 1)
with open(path, 'w', encoding='utf-8') as f:
    f.write(result)
print('OK: 6 cases inserted')
