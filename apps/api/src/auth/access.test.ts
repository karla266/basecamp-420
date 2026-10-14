import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SESSION_COOKIE } from '@basecamp/shared'
import { createHttp, createTestApp, seedUser, type TestApp } from '../testing/create-test-app'

describe('auth and tenant guard', () => {
  let app: TestApp
  let http: Awaited<ReturnType<typeof createHttp>>

  beforeAll(async () => {
    app = await createTestApp()
    const admin = await seedUser(app, {
      email: 'admin@test.local',
      password: 'admin-pass-1',
      role: 'platform_admin',
    })
    const orgA = await app.clients.createOrganization(admin.actor, { name: 'Acme' }, 'req')
    const orgB = await app.clients.createOrganization(admin.actor, { name: 'Beta' }, 'req')
    await seedUser(app, {
      email: 'op-a@test.local',
      password: 'operator-pass',
      role: 'operator',
      organizationId: orgA.id,
    })
    await seedUser(app, {
      email: 'client@test.local',
      password: 'client-pass-1',
      role: 'client_viewer',
      organizationId: orgA.id,
    })
    http = await createHttp(app)
    ;(app as TestApp & { orgB?: string }).orgB = orgB.id
  })

  afterAll(async () => {
    await http.close()
  })

  it('sets an httpOnly session cookie and blocks another organization', async () => {
    const login = await request(http.getHttpServer())
      .post('/auth/login')
      .send({ email: 'op-a@test.local', password: 'operator-pass' })
    expect(login.status).toBe(200)
    const setCookie = String(login.headers['set-cookie'])
    expect(setCookie).toContain(`${SESSION_COOKIE}=`)
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(login.body.token).toBeUndefined()

    const me = await request(http.getHttpServer()).get('/auth/me').set('cookie', setCookie)
    expect(me.status).toBe(200)
    expect(me.body.canAccessAdmin).toBe(true)
    expect(me.body.canAccessPortal).toBe(false)

    const orgB = (app as TestApp & { orgB: string }).orgB
    const denied = await request(http.getHttpServer())
      .get(`/organizations/${orgB}/contacts`)
      .set('cookie', setCookie)
    expect(denied.status).toBe(403)

    const allowedId = me.body.organizations[0].id as string
    const allowed = await request(http.getHttpServer())
      .get(`/organizations/${allowedId}/contacts`)
      .set('cookie', setCookie)
    expect(allowed.status).toBe(200)
  })

  it('rejects a client session from the admin capability', async () => {
    const login = await request(http.getHttpServer())
      .post('/auth/login')
      .send({ email: 'client@test.local', password: 'client-pass-1' })
    const me = await request(http.getHttpServer())
      .get('/auth/me')
      .set('cookie', String(login.headers['set-cookie']))
    expect(me.body.canAccessAdmin).toBe(false)
    expect(me.body.canAccessPortal).toBe(true)
    const create = await request(http.getHttpServer())
      .post('/organizations')
      .set('cookie', String(login.headers['set-cookie']))
      .send({ name: 'No permitido' })
    expect(create.status).toBe(403)
  })
})
