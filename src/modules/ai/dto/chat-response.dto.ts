export class ChatResponseDto {
  reply!: string;
  sessionId?: string;
}

export class AiHealthResponseDto {
  status!: "ok";
  module!: "ai";
  ready!: boolean;
}
