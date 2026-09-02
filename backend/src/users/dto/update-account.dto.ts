import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  password?: string;

  @IsOptional()
  @IsIn(['USER', 'DEV', 'LIDER'])
  role?: 'USER' | 'DEV' | 'LIDER';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
