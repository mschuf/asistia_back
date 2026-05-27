import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class ChatRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;
}
