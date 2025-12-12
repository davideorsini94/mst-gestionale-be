import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { StaffDocumentType } from './entities/staff.entity';
import { FastifyRequest, FastifyReply } from 'fastify';
import { FileService } from '../../common/files/file.service';
import { RequireCapabilities } from '../../common/auth/decorators/capabilities.decorator';
import { Capability } from '../../common/models/capabilities-per-role/capability.enum';

@ApiTags('Staff')
@ApiBearerAuth()
@Controller('staff')
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
    private readonly fileService: FileService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista staff' })
  @RequireCapabilities(Capability.CAN_VIEW_STAFF)
  async findAll(@Query('filters') filters?: string) {
    return this.staffService.findAndCountWithFilterList(filters, null);
  }

  // Endpoint per ottenere il proprio profilo staff (deve essere PRIMA di :uuid)
  @Get('me')
  @ApiOperation({ summary: 'Ottieni il proprio profilo staff' })
  async getMyProfile(@Req() req: FastifyRequest) {
    const user = (req as any).user;
    // Prima cerca per linkedUserUuid, poi per email come fallback
    let staffMember = await this.staffService.findByLinkedUserUuid(user.uuid);
    if (!staffMember && user.email) {
      staffMember = await this.staffService.findByEmail(user.email);
    }
    if (!staffMember) {
      return { found: false, message: 'Profilo staff non collegato a questo utente' };
    }
    return this.staffService.findByUuidWithDocuments(staffMember.uuid);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Dettaglio membro staff con documenti' })
  @RequireCapabilities(Capability.CAN_VIEW_STAFF)
  async findOne(@Param('uuid') uuid: string) {
    return this.staffService.findByUuidWithDocuments(uuid);
  }

  @Get(':uuid/profile-image')
  @ApiOperation({ summary: 'Ottieni immagine profilo' })
  async getProfileImage(
    @Param('uuid') uuid: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const staff = await this.staffService.findByUuidWithDocuments(uuid);
    if (!staff.profileImageUuid) {
      res.status(404);
      return { error: 'Profile image not found' };
    }
    const { stream, mimeType } = await this.fileService.getFileStream(staff.profileImageUuid);
    res.header('Content-Type', mimeType);
    res.header('Cache-Control', 'private, max-age=3600');
    return new StreamableFile(stream);
  }

  @Post()
  @ApiOperation({ summary: 'Crea membro staff' })
  @RequireCapabilities(Capability.CAN_MANAGE_STAFF)
  async create(@Body() createStaffDto: CreateStaffDto) {
    return this.staffService.create(createStaffDto);
  }

  // Endpoint per modificare il proprio profilo staff (deve essere PRIMA di :uuid)
  @Put('me')
  @ApiOperation({ summary: 'Aggiorna il proprio profilo staff' })
  async updateMyProfile(@Req() req: FastifyRequest, @Body() updateStaffDto: UpdateStaffDto) {
    const user = (req as any).user;
    // Prima cerca per linkedUserUuid, poi per email come fallback
    let staffMember = await this.staffService.findByLinkedUserUuid(user.uuid);
    if (!staffMember && user.email) {
      staffMember = await this.staffService.findByEmail(user.email);
    }
    if (!staffMember) {
      throw new Error('Profilo staff non trovato per questo utente');
    }
    return this.staffService.update(staffMember.uuid, updateStaffDto);
  }

  @Put(':uuid')
  @ApiOperation({ summary: 'Aggiorna membro staff' })
  @RequireCapabilities(Capability.CAN_MANAGE_STAFF)
  async update(@Param('uuid') uuid: string, @Body() updateStaffDto: UpdateStaffDto) {
    return this.staffService.update(uuid, updateStaffDto);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Elimina membro staff' })
  @RequireCapabilities(Capability.CAN_MANAGE_STAFF)
  async remove(@Param('uuid') uuid: string) {
    return this.staffService.delete(uuid);
  }

  // Upload foto profilo
  @Post(':uuid/profile-image')
  @ApiOperation({ summary: 'Upload foto profilo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadProfileImage(@Param('uuid') uuid: string, @Req() req: FastifyRequest) {
    const body = req.body as any;
    const file = body.file;
    
    if (!file) {
      throw new Error('File non trovato');
    }

    const buffer = await file.toBuffer();
    return this.staffService.uploadProfileImage(uuid, {
      filename: file.filename,
      buffer,
      mimetype: file.mimetype,
    });
  }

  // Elimina foto profilo
  @Delete(':uuid/profile-image')
  @ApiOperation({ summary: 'Elimina foto profilo staff' })
  async deleteProfileImage(@Param('uuid') uuid: string) {
    return this.staffService.deleteProfileImage(uuid);
  }

  // Upload documento (visita medica, patente allenatore, etc.)
  @Post(':uuid/documents')
  @ApiOperation({ summary: 'Upload documento staff' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        documentType: { type: 'string', enum: Object.values(StaffDocumentType) },
        description: { type: 'string' },
      },
    },
  })
  async uploadDocument(
    @Param('uuid') uuid: string,
    @Req() req: FastifyRequest,
  ) {
    const body = req.body as any;
    const file = body.file;
    
    if (!file) {
      throw new Error('File non trovato');
    }

    const buffer = await file.toBuffer();
    const documentType = body.documentType?.value || StaffDocumentType.OTHER;
    const description = body.description?.value;

    return this.staffService.uploadDocument(
      uuid,
      { filename: file.filename, buffer, mimetype: file.mimetype },
      documentType,
      description,
    );
  }

  // Lista documenti
  @Get(':uuid/documents')
  @ApiOperation({ summary: 'Lista documenti staff' })
  async getDocuments(@Param('uuid') uuid: string) {
    return this.staffService.getDocuments(uuid);
  }

  // Download documento - ora usa l'endpoint generico /files/:uuid/download
  @Get('documents/:documentUuid/download')
  @ApiOperation({ summary: 'Download documento (usa /files/:fileUuid/download)' })
  async downloadDocument(
    @Param('documentUuid') documentUuid: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    // Redirect all'endpoint generico
    res.status(301);
    res.header('Location', `/api/files/${documentUuid}/download`);
    return { message: 'Use /files/:uuid/download endpoint' };
  }

  // Elimina documento
  @Delete('documents/:documentUuid')
  @ApiOperation({ summary: 'Elimina documento' })
  async deleteDocument(@Param('documentUuid') documentUuid: string) {
    await this.staffService.deleteDocument(documentUuid);
    return { success: true };
  }
}
