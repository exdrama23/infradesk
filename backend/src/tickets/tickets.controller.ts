import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, TicketStatus } from '../generated/prisma/client';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { DevReviewDto } from './dto/dev-review.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
    constructor(private readonly tickets: TicketsService) { }

    @Post()
    create(@CurrentUser() user, @Body() dto: CreateTicketDto) {
        return this.tickets.create(user, dto);
    }

    @Get()
  findAll(
    @CurrentUser() user,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: TicketStatus,
  ) {
    return this.tickets.findAll(user, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status: status && Object.values(TicketStatus).includes(status) ? status : undefined,
    });
  }

  @Get(':id')
  findById(@CurrentUser() user, @Param('id', ParseUUIDPipe) id: string) {
    return this.tickets.findById(id, user);
  }

  @Post(':id/assign')
  @Roles(UserRole.DEV, UserRole.LIDER)
  assign(
    @CurrentUser() user,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.tickets.assign(user, id, dto);
  }

  @Post(':id/review')
  @Roles(UserRole.DEV, UserRole.LIDER)
  review(
    @CurrentUser() user,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DevReviewDto,
  ) {
    return this.tickets.review(user, id, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user, @Param('id', ParseUUIDPipe) id: string) {
    return this.tickets.cancel(user, id);
  }
}