import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { FileService } from './file.service';
import { RequireAnyCapability } from '../auth/decorators/capabilities.decorator';
import { Capability } from '../models/capabilities-per-role/capability.enum';
import { setFileHeaders } from './file-types';

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  /**
   * Il file appartiene a un tesserato o a uno staff: serve il permesso di vedere quel tipo di anagrafica
   * (prima bastava uno dei due per scaricare anche i documenti dell'altro).
   */
  private async assertCanView(req: FastifyRequest, uuid: string): Promise<void> {
    const owner = await this.fileService.findOwner(uuid);
    if (!owner) throw new NotFoundException('File non trovato');
    const caps: string[] = ((req as any).user?.role?.capabilities ?? []).map((c: any) => c.capability);
    const needed = owner.type === 'member' ? Capability.CAN_VIEW_MEMBERS : Capability.CAN_VIEW_STAFF;
    if (!caps.includes(needed)) throw new ForbiddenException('Operazione non consentita');
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Download file by UUID' })
  @RequireAnyCapability(Capability.CAN_VIEW_MEMBERS, Capability.CAN_VIEW_STAFF)
  async getFile(
    @Param('uuid') uuid: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.assertCanView(req, uuid);
    const { stream, mimeType, originalName } = await this.fileService.getFileStream(uuid);
    setFileHeaders(res, mimeType, originalName, 'inline');
    res.header('Cache-Control', 'private, max-age=3600');
    return new StreamableFile(stream);
  }

  @Get(':uuid/download')
  @ApiOperation({ summary: 'Download file as attachment' })
  @RequireAnyCapability(Capability.CAN_VIEW_MEMBERS, Capability.CAN_VIEW_STAFF)
  async downloadFile(
    @Param('uuid') uuid: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.assertCanView(req, uuid);
    const { stream, mimeType, originalName } = await this.fileService.getFileStream(uuid);
    setFileHeaders(res, mimeType, originalName, 'attachment');
    return new StreamableFile(stream);
  }
  // Nessuna cancellazione generica: foto e documenti si eliminano dagli endpoint di tesserati/staff, che controllano
  // il proprietario e aggiornano anche il documento collegato.
}
