import { Body, Controller, Get, Patch, Param, Post, UseGuards } from '@nestjs/common';
import { ParseUUIDPipe } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../generated/prisma/client';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@Controller('messages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post()
  @Roles(UserRole.LIDER)
  send(@CurrentUser() user, @Body() dto: SendMessageDto) {
    return this.messages.send(user.id, dto);
  }

  @Get('inbox')
  inbox(@CurrentUser() user) {
    return this.messages.inbox(user.id);
  }

  @Get('sent')
  @Roles(UserRole.LIDER)
  sent(@CurrentUser() user) {
    return this.messages.sent(user.id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user) {
    return this.messages.markAllRead(user.id);
  }

  @Get('sessions')
  @Roles(UserRole.LIDER)
  sessions(@CurrentUser() user) {
    return this.messages.sessionsForLeader(user.id);
  }

  @Patch(':id')
  @Roles(UserRole.LIDER)
  update(@CurrentUser() user, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMessageDto) {
    return this.messages.updateMessage(id, user.id, dto.content);
  }
}