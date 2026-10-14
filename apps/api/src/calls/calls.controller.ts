import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { createCallSchema, paginationSchema } from '@basecamp/shared'
import { APP_CONTEXT, type AppContext } from '../context'
import { actorOf, requestIdOf, SessionGuard, TenantGuard, type AuthedRequest } from '../http/http'
import { parseInput } from '../http/parse'

@Controller()
@UseGuards(SessionGuard, TenantGuard)
export class CallsController {
  constructor(@Inject(APP_CONTEXT) private readonly app: AppContext) {}

  @Get('organizations/:organizationId/calls')
  list(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Query() query: unknown,
  ) {
    return this.app.calls.list(actorOf(req), organizationId, parseInput(paginationSchema, query))
  }

  @Post('organizations/:organizationId/calls')
  place(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(createCallSchema, body)
    return this.app.calls.place(actorOf(req), organizationId, input.contactId, requestIdOf(req))
  }

  @Get('organizations/:organizationId/calls/:callId')
  get(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('callId') callId: string,
  ) {
    return this.app.calls.get(actorOf(req), organizationId, callId)
  }
}
