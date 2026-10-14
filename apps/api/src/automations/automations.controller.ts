import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common'
import { createAutomationSchema, startAutomationSchema } from '@basecamp/shared'
import { APP_CONTEXT, type AppContext } from '../context'
import { actorOf, requestIdOf, SessionGuard, TenantGuard, type AuthedRequest } from '../http/http'
import { parseInput } from '../http/parse'

@Controller()
@UseGuards(SessionGuard, TenantGuard)
export class AutomationsController {
  constructor(@Inject(APP_CONTEXT) private readonly app: AppContext) {}

  @Get('organizations/:organizationId/automations')
  list(@Req() req: AuthedRequest, @Param('organizationId') organizationId: string) {
    return this.app.automations.list(actorOf(req), organizationId)
  }

  @Post('organizations/:organizationId/automations')
  create(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ) {
    return this.app.automations.create(
      actorOf(req),
      organizationId,
      parseInput(createAutomationSchema, body),
      requestIdOf(req),
    )
  }

  @Get('organizations/:organizationId/automations/:automationId/runs')
  runs(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('automationId') automationId: string,
  ) {
    return this.app.automations.listRuns(actorOf(req), organizationId, automationId)
  }

  @Post('organizations/:organizationId/automations/:automationId/runs')
  start(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('automationId') automationId: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(startAutomationSchema, body)
    return this.app.automations.startManual(
      actorOf(req),
      organizationId,
      automationId,
      input.contactId,
      requestIdOf(req),
    )
  }

  @Post('organizations/:organizationId/automation-runs/:runId/cancel')
  cancel(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('runId') runId: string,
  ) {
    return this.app.automations.cancel(actorOf(req), organizationId, runId, requestIdOf(req))
  }
}
