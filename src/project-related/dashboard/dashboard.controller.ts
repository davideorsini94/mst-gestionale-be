import { Controller, Get, Query, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { VehicleService } from '../vehicles/vehicle.service';
import { StaffService } from '../staff/staff.service';
import { MemberService } from '../members/member.service';
import { TransactionService } from '../transactions/transaction.service';
import { RequireCapabilities } from '../../common/auth/decorators/capabilities.decorator';
import { Capability } from '../../common/models/capabilities-per-role/capability.enum';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly vehicleService: VehicleService,
    private readonly staffService: StaffService,
    private readonly memberService: MemberService,
    private readonly transactionService: TransactionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Dati dashboard in base al ruolo utente' })
  @ApiQuery({ name: 'daysAhead', required: false, type: Number })
  @RequireCapabilities(Capability.CAN_VIEW_DASHBOARD)
  async getDashboardData(
    @Request() req: any,
    @Query('daysAhead') daysAhead?: number,
  ) {
    const user = req.user;
    const roleCode = user.role?.code;
    // i parametri di query arrivano come stringhe: "30" sommato a una data dava 2230 giorni
    const parsed = Number(daysAhead);
    const days = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 3650) : 30;

    // Admin: vede tutto
    if (roleCode === 'admin') {
      return this.getAdminDashboard(days);
    }

    // Staff: vede solo le proprie scadenze e veicoli assegnati
    if (roleCode === 'staff') {
      // Cerca lo staff collegato all'utente (per email o altro campo)
      const staffMember = await this.findStaffByUser(user);
      if (staffMember) {
        return this.getStaffDashboard(staffMember.uuid, days);
      }
      // Se non trova uno staff collegato, mostra dashboard staff generica
      return this.getStaffDashboardGeneric(user, days);
    }

    // User base: dashboard minima
    return this.getBasicDashboard();
  }

  private async getAdminDashboard(daysAhead: number) {
    // Solo conteggi: non serve caricare (e decifrare) tutte le anagrafiche
    const [vehicleExpiries, totalStaff, totalMembers] = await Promise.all([
      this.vehicleService.getExpiringDocuments(daysAhead),
      this.staffService.count(),
      this.memberService.count(),
    ]);

    return {
      type: 'admin',
      stats: {
        totalStaff,
        totalMembers,
      },
      vehicleExpiries,
    };
  }

  private async getStaffDashboard(staffUuid: string, daysAhead: number) {
    const [staffMember, assignedVehicles, vehicleExpiries] = await Promise.all([
      this.staffService.findByUuid(staffUuid),
      this.vehicleService.getVehiclesByStaff(staffUuid),
      this.vehicleService.getExpiringDocumentsForStaff(staffUuid, daysAhead),
    ]);

    // Scadenze personali dello staff
    const personalExpiries: { field: string; label: string; date: Date }[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const futureDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);

    const checkExpiry = (date: Date | null, field: string, label: string) => {
      if (date) {
        const d = new Date(date);
        const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (dateOnly >= today && dateOnly <= futureDate) {
          personalExpiries.push({ field, label, date: d });
        }
      }
    };

    checkExpiry(staffMember.drivingLicenseExpiry, 'drivingLicenseExpiry', 'Patente');
    checkExpiry(staffMember.skiInstructorLicenseExpiry, 'skiInstructorLicenseExpiry', 'Patentino Maestro Sci');
    checkExpiry(staffMember.firstAidCertificateExpiry, 'firstAidCertificateExpiry', 'Primo Soccorso');
    checkExpiry(staffMember.coachLicenseExpiry, 'coachLicenseExpiry', 'Licenza Allenatore');
    checkExpiry(staffMember.medicalExamExpiry, 'medicalExamExpiry', 'Visita Medica');

    return {
      type: 'staff',
      staff: {
        uuid: staffMember.uuid,
        firstName: staffMember.firstName,
        lastName: staffMember.lastName,
      },
      personalExpiries,
      assignedVehicles,
      vehicleExpiries,
    };
  }

  private async getStaffDashboardGeneric(user: any, daysAhead: number) {
    // Dashboard per utenti staff non collegati a un record staff specifico
    // Mostra un messaggio di benvenuto senza scadenze personali
    return {
      type: 'staff',
      staff: {
        uuid: user.uuid,
        firstName: user.firstName || user.username,
        lastName: user.lastName || '',
      },
      personalExpiries: [],
      assignedVehicles: [],
      vehicleExpiries: {
        insurance: [],
        inspection: [],
        tax: [],
      },
      message: 'Per visualizzare le tue scadenze personali, chiedi all\'amministratore di collegare il tuo account a un profilo staff.',
    };
  }

  private async getBasicDashboard() {
    return {
      type: 'user',
      message: 'Dashboard utente base',
    };
  }

  private async findStaffByUser(user: any) {
    // Prima cerca per linkedUserUuid
    const staffByUuid = await this.staffService.findByLinkedUserUuid(user.uuid);
    if (staffByUuid) {
      console.log(`[findStaffByUser] Found staff by linkedUserUuid: ${staffByUuid.uuid}`);
      return staffByUuid;
    }
    
    // Fallback: cerca per email
    if (user.email) {
      const staffByEmail = await this.staffService.findByEmail(user.email);
      if (staffByEmail) {
        console.log(`[findStaffByUser] Found staff by email: ${staffByEmail.uuid}`);
        return staffByEmail;
      }
    }
    
    console.log(`[findStaffByUser] No staff found for user ${user.uuid}`);
    return null;
  }
}
