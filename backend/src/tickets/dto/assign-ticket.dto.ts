import { IsUUID } from 'class-validator';

export class AssignTicketDto {
  @IsUUID('4', { message: 'devId inválido' })
  devId: string;
}
