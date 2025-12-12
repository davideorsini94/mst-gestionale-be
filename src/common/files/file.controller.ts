import {
  Controller,
  Get,
  Delete,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { FileService } from './file.service';

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Get(':uuid')
  @ApiOperation({ summary: 'Download file by UUID' })
  async getFile(
    @Param('uuid') uuid: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { stream, mimeType, originalName } = await this.fileService.getFileStream(uuid);
    res.header('Content-Type', mimeType);
    res.header('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
    res.header('Cache-Control', 'private, max-age=3600');
    return new StreamableFile(stream);
  }

  @Get(':uuid/download')
  @ApiOperation({ summary: 'Download file as attachment' })
  async downloadFile(
    @Param('uuid') uuid: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { stream, mimeType, originalName } = await this.fileService.getFileStream(uuid);
    res.header('Content-Type', mimeType);
    res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);
    return new StreamableFile(stream);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Delete file' })
  async deleteFile(@Param('uuid') uuid: string) {
    await this.fileService.deleteFile(uuid);
    return { success: true };
  }
}
