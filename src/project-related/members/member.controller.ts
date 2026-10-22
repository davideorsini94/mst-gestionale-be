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
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { MemberService } from './member.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MemberDocumentType } from './entities/member.entity';
import { FastifyRequest, FastifyReply } from 'fastify';
import { FileService } from '../../common/files/file.service';
import { RequireCapabilities } from '../../common/auth/decorators/capabilities.decorator';
import { Capability } from '../../common/models/capabilities-per-role/capability.enum';
import { StripProtectedFieldsPipe, PROFILE_IMAGE_FIELDS } from '../../common/pipes/strip-protected-fields.pipe';
import { setFileHeaders } from '../../common/files/file-types';

@ApiTags('Members (Tesserati)')
@ApiBearerAuth()
@Controller('members')
export class MemberController {
  constructor(
    private readonly memberService: MemberService,
    private readonly fileService: FileService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista tesserati' })
  @RequireCapabilities(Capability.CAN_VIEW_MEMBERS)
  async findAll(@Query('filters') filters?: string) {
    return this.memberService.findAndCountWithFilterList(filters, null);
  }

  @Get('competitors')
  @ApiOperation({ summary: 'Lista atleti agonisti' })
  @RequireCapabilities(Capability.CAN_VIEW_MEMBERS)
  async findCompetitors() {
    return this.memberService.findCompetitors();
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Dettaglio tesserato con documenti' })
  @RequireCapabilities(Capability.CAN_VIEW_MEMBERS)
  async findOne(@Param('uuid') uuid: string) {
    return this.memberService.findByUuidWithDocuments(uuid);
  }

  @Get(':uuid/profile-image')
  @ApiOperation({ summary: 'Ottieni immagine profilo' })
  @RequireCapabilities(Capability.CAN_VIEW_MEMBERS)
  async getProfileImage(
    @Param('uuid') uuid: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const member = await this.memberService.findByUuidWithDocuments(uuid);
    if (!member.profileImageUuid) {
      throw new NotFoundException('Nessuna foto profilo');
    }
    const { stream, mimeType, originalName } = await this.fileService.getFileStream(member.profileImageUuid);
    setFileHeaders(res, mimeType, originalName, 'inline');
    res.header('Cache-Control', 'private, max-age=3600');
    return new StreamableFile(stream);
  }

  @Post()
  @ApiOperation({ summary: 'Crea tesserato' })
  @RequireCapabilities(Capability.CAN_MANAGE_MEMBERS)
  async create(@Body(new StripProtectedFieldsPipe(PROFILE_IMAGE_FIELDS)) createMemberDto: CreateMemberDto) {
    return this.memberService.create(createMemberDto);
  }

  @Put(':uuid')
  @ApiOperation({ summary: 'Aggiorna tesserato' })
  @RequireCapabilities(Capability.CAN_MANAGE_MEMBERS)
  async update(@Param('uuid') uuid: string, @Body(new StripProtectedFieldsPipe(PROFILE_IMAGE_FIELDS)) updateMemberDto: UpdateMemberDto) {
    return this.memberService.update(uuid, updateMemberDto);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Elimina tesserato' })
  @RequireCapabilities(Capability.CAN_MANAGE_MEMBERS)
  async remove(@Param('uuid') uuid: string) {
    return this.memberService.delete(uuid);
  }

  // Genera lista prenotazione alberghiera
  @Post('hotel-booking-list')
  @ApiOperation({ summary: 'Genera lista prenotazione alberghiera per atleti selezionati' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        memberUuids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista UUID degli atleti da includere',
        },
        staffUuids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista UUID degli allenatori (staff) da aggiungere',
        },
      },
    },
  })
  @RequireCapabilities(Capability.CAN_VIEW_MEMBERS)
  async generateHotelBookingList(
    @Req() req: FastifyRequest,
    @Body() body: { memberUuids: string[]; staffUuids?: string[] },
  ) {
    const staffUuids = body?.staffUuids ?? [];
    // i dati degli allenatori sono dati dello staff: serve anche il permesso di vederli
    const caps: string[] = ((req as any).user?.role?.capabilities ?? []).map((c: any) => c.capability);
    if (Array.isArray(staffUuids) && staffUuids.length && !caps.includes(Capability.CAN_VIEW_STAFF)) {
      throw new ForbiddenException('Non hai il permesso di vedere lo staff');
    }
    return this.memberService.generateHotelBookingList(body?.memberUuids, staffUuids);
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
  @RequireCapabilities(Capability.CAN_MANAGE_MEMBERS)
  async uploadProfileImage(@Param('uuid') uuid: string, @Req() req: FastifyRequest) {
    const body = req.body as any;
    const file = body.file;
    
    if (!file) {
      throw new BadRequestException('Nessun file caricato');
    }

    const buffer = await file.toBuffer();
    return this.memberService.uploadProfileImage(uuid, {
      filename: file.filename,
      buffer,
      mimetype: file.mimetype,
    });
  }

  // Elimina foto profilo
  @Delete(':uuid/profile-image')
  @ApiOperation({ summary: 'Elimina foto profilo tesserato' })
  @RequireCapabilities(Capability.CAN_MANAGE_MEMBERS)
  async deleteProfileImage(@Param('uuid') uuid: string) {
    return this.memberService.deleteProfileImage(uuid);
  }

  // Upload documento (visita medica, tessera FISI, etc.)
  @Post(':uuid/documents')
  @ApiOperation({ summary: 'Upload documento tesserato' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        documentType: { type: 'string', enum: Object.values(MemberDocumentType) },
        description: { type: 'string' },
        expiryDate: { type: 'string', format: 'date' },
      },
    },
  })
  @RequireCapabilities(Capability.CAN_MANAGE_MEMBERS)
  async uploadDocument(
    @Param('uuid') uuid: string,
    @Req() req: FastifyRequest,
  ) {
    const body = req.body as any;
    const file = body.file;
    
    if (!file) {
      throw new BadRequestException('Nessun file caricato');
    }

    const buffer = await file.toBuffer();
    const documentType = body.documentType?.value || MemberDocumentType.OTHER;
    const description = body.description?.value;
    // stringa 'AAAA-MM-GG' validata dal servizio (new Date accettava date inesistenti come il 30 febbraio)
    const expiryDate = body.expiryDate?.value ? String(body.expiryDate.value).trim() : undefined;

    return this.memberService.uploadDocument(
      uuid,
      { filename: file.filename, buffer, mimetype: file.mimetype },
      documentType,
      description,
      expiryDate,
    );
  }

  // Lista documenti
  @Get(':uuid/documents')
  @ApiOperation({ summary: 'Lista documenti tesserato' })
  @RequireCapabilities(Capability.CAN_VIEW_MEMBERS)
  async getDocuments(@Param('uuid') uuid: string) {
    return this.memberService.getDocuments(uuid);
  }

  // Download documento - ora usa l'endpoint generico /files/:uuid/download
  // Mantenuto per retrocompatibilità
  @Get('documents/:documentUuid/download')
  @ApiOperation({ summary: 'Download documento (usa /files/:fileUuid/download)' })
  @RequireCapabilities(Capability.CAN_VIEW_MEMBERS)
  async downloadDocument(
    @Param('documentUuid') documentUuid: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    // Trova il documento per ottenere il fileUuid
    const documents = await this.memberService.getDocuments('');
    // Questo endpoint è deprecato, usare /files/:uuid/download
    res.status(301);
    res.header('Location', `/api/files/${documentUuid}/download`);
    return { message: 'Use /files/:uuid/download endpoint' };
  }

  // Elimina documento
  @Delete('documents/:documentUuid')
  @ApiOperation({ summary: 'Elimina documento' })
  @RequireCapabilities(Capability.CAN_MANAGE_MEMBERS)
  async deleteDocument(@Param('documentUuid') documentUuid: string) {
    await this.memberService.deleteDocument(documentUuid);
    return { success: true };
  }
}
