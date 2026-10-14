import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  assignOperatorSchema,
  consentSchema,
  createContactSchema,
  createOrganizationSchema,
  paginationSchema,
  updateContactSchema,
  updateOrganizationSchema,
} from '@basecamp/shared'
import { APP_CONTEXT, type AppContext } from '../context'
import { actorOf, requestIdOf, SessionGuard, TenantGuard, type AuthedRequest } from '../http/http'
import { parseInput } from '../http/parse'

@Controller()
@UseGuards(SessionGuard, TenantGuard)
export class ClientsController {
  constructor(@Inject(APP_CONTEXT) private readonly app: AppContext) {}

  @Get('organizations')
  listOrganizations(@Req() req: AuthedRequest, @Query() query: unknown) {
    return this.app.clients.listOrganizations(actorOf(req), parseInput(paginationSchema, query))
  }

  @Post('organizations')
  createOrganization(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.app.clients.createOrganization(
      actorOf(req),
      parseInput(createOrganizationSchema, body),
      requestIdOf(req),
    )
  }

  @Get('organizations/:organizationId')
  getOrganization(@Req() req: AuthedRequest, @Param('organizationId') organizationId: string) {
    return this.app.clients.getOrganization(actorOf(req), organizationId)
  }

  @Patch('organizations/:organizationId')
  updateOrganization(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ) {
    return this.app.clients.updateOrganization(
      actorOf(req),
      organizationId,
      parseInput(updateOrganizationSchema, body),
      requestIdOf(req),
    )
  }

  @Get('organizations/:organizationId/operators')
  listOperators(@Req() req: AuthedRequest, @Param('organizationId') organizationId: string) {
    return this.app.clients.listOperators(actorOf(req), organizationId)
  }

  @Post('organizations/:organizationId/operators')
  assignOperator(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(assignOperatorSchema, body)
    return this.app.clients.assignOperator(actorOf(req), organizationId, input.userId, requestIdOf(req))
  }

  @Delete('organizations/:organizationId/operators/:userId')
  unassignOperator(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('userId') userId: string,
  ) {
    return this.app.clients.unassignOperator(actorOf(req), organizationId, userId, requestIdOf(req))
  }

  @Get('organizations/:organizationId/contacts')
  listContacts(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Query() query: unknown,
  ) {
    return this.app.clients.listContacts(actorOf(req), organizationId, parseInput(paginationSchema, query))
  }

  @Post('organizations/:organizationId/contacts')
  createContact(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ) {
    return this.app.clients.createContact(
      actorOf(req),
      organizationId,
      parseInput(createContactSchema, body),
      requestIdOf(req),
    )
  }

  @Patch('organizations/:organizationId/contacts/:contactId')
  updateContact(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('contactId') contactId: string,
    @Body() body: unknown,
  ) {
    return this.app.clients.updateContact(
      actorOf(req),
      organizationId,
      contactId,
      parseInput(updateContactSchema, body),
      requestIdOf(req),
    )
  }

  @Post('organizations/:organizationId/contacts/:contactId/consent')
  setConsent(
    @Req() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('contactId') contactId: string,
    @Body() body: unknown,
  ) {
    return this.app.clients.setConsent(
      actorOf(req),
      organizationId,
      contactId,
      parseInput(consentSchema, body),
      requestIdOf(req),
    )
  }
}
