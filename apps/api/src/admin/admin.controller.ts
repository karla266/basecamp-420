import { Body, Controller, Get, Inject, Post, Query, Req, UseGuards } from '@nestjs/common'
import { invitationSchema, paginationSchema, ROLES } from '@basecamp/shared'
import { z } from 'zod'
import { APP_CONTEXT, type AppContext } from '../context'
import { actorOf, requestIdOf, SessionGuard, type AuthedRequest } from '../http/http'
import { parseInput } from '../http/parse'

const usersQuery = paginationSchema.extend({
  role: z.enum(ROLES).optional(),
  organizationId: z.string().min(1).optional(),
})

const summaryQuery = z.object({
  organizationId: z.string().min(1).optional(),
})

@Controller()
@UseGuards(SessionGuard)
export class AdminController {
  constructor(@Inject(APP_CONTEXT) private readonly app: AppContext) {}

  @Get('summary')
  summary(@Req() req: AuthedRequest, @Query() query: unknown) {
    const input = parseInput(summaryQuery, query)
    return this.app.summary.get(actorOf(req), input.organizationId)
  }

  @Get('admin/users')
  users(@Req() req: AuthedRequest, @Query() query: unknown) {
    return this.app.admin.listUsers(actorOf(req), parseInput(usersQuery, query))
  }

  @Post('admin/invitations')
  invite(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.app.admin.invite(actorOf(req), parseInput(invitationSchema, body), requestIdOf(req))
  }
}
