import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common'
import { acceptInviteSchema, canAccessAdmin, loginSchema, SESSION_COOKIE } from '@basecamp/shared'
import type { Response } from 'express'
import { APP_CONTEXT, type AppContext } from '../context'
import { sessionCookieOptions } from '../http/cookies'
import { actorOf, requestIdOf, SessionGuard, type AuthedRequest } from '../http/http'
import { parseInput } from '../http/parse'

@Controller('auth')
export class AuthController {
  constructor(@Inject(APP_CONTEXT) private readonly app: AppContext) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const input = parseInput(loginSchema, body)
    const result = await this.app.auth.login(input.email, input.password, requestIdOf(req))
    res.cookie(SESSION_COOKIE, result.token, sessionCookieOptions())
    res.cookie('basecamp_scope', canAccessAdmin(result.actor) ? 'staff' : 'client', sessionCookieOptions())
    return { ok: true }
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async logout(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const token = req.cookies?.[SESSION_COOKIE]
    if (token) await this.app.auth.logout(token, requestIdOf(req))
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    res.clearCookie('basecamp_scope', { path: '/' })
    return { ok: true }
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: AuthedRequest) {
    return this.app.auth.me(actorOf(req))
  }

  @Post('invitations/accept')
  accept(@Body() body: unknown, @Req() req: AuthedRequest) {
    const input = parseInput(acceptInviteSchema, body)
    return this.app.admin.acceptInvite(input, requestIdOf(req))
  }
}
