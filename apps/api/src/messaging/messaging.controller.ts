import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { createTemplateSchema, paginationSchema, sendMessageSchema } from '@basecamp/shared'
import { APP_CONTEXT, type AppContext } from '../context'
import { actorOf, requestIdOf, SessionGuard, TenantGuard, type AuthedRequest } from '../http/http'
import { parseInput } from '../http/parse'

@Controller()
@UseGuards(SessionGuard, TenantGuard)
export class MessagingController {
  constructor(@Inject(APP_CONTEXT) private readonly app: AppContext) {}

  @Get('organizations/:organizationId/templates')
  listTemplates(@Req() req: AuthedRequest, @Param('organizationId') organizationId: string) {
    return this.app.messaging.listTemplates(actorOf(req), organizationId)
  }

  @Post('organizations/:organizationId/templates')
  createTemplate(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ) {
    return this.app.messaging.createTemplate(
      actorOf(req),
      organizationId,
      parseInput(createTemplateSchema, body),
      requestIdOf(req),
    )
  }

  @Get('organizations/:organizationId/conversations')
  listConversations(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Query() query: unknown,
  ) {
    return this.app.messaging.listConversations(
      actorOf(req),
      organizationId,
      parseInput(paginationSchema, query),
    )
  }

  @Get('organizations/:organizationId/conversations/:conversationId')
  getConversation(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.app.messaging.getConversation(actorOf(req), organizationId, conversationId)
  }

  @Post('organizations/:organizationId/messages')
  send(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ) {
    return this.app.messaging.sendManual(
      actorOf(req),
      organizationId,
      parseInput(sendMessageSchema, body),
      requestIdOf(req),
    )
  }
}
