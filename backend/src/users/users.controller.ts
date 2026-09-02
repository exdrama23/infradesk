import { Body, Controller, Get, Patch, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('devs')
  @Roles(UserRole.DEV, UserRole.LIDER)
  findDevs() {
    return this.users.findDevs();
  }

  @Get()
  @Roles(UserRole.LIDER)
  findAll() {
    return this.users.findAll();
  }

  @Post()
  @Roles(UserRole.LIDER)
  createDevAccount(@Body() dto: CreateAccountDto) {
    return this.users.createDevAccount(dto);
  }

  @Patch(':id')
  @Roles(UserRole.LIDER)
  updateAccount(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountDto) {
    return this.users.updateAccount(id, dto);
  }

  @Post(':id/toggle-active')
  @Roles(UserRole.LIDER)
  toggleActive(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.toggleActive(id);
  }
}