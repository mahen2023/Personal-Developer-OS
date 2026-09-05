import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export interface AuthUser {
  id: string;
  email: string;
  sessionId: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user as AuthUser;
  },
);
