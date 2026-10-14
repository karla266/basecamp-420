import { Notice } from '@/components/notice'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { assignOperatorAction, consentAction, createContactAction, placeCallAction } from '@/lib/actions'
import { api } from '@/lib/api'
import { yesNo } from '@/lib/format'
import { canOperateOrg, platformAdmin } from '@/lib/org'
import type { Contact, Me, Organization, Page, UserRow } from '@/lib/types'

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>
  searchParams: Promise<{ aviso?: string; q?: string }>
}) {
  const { organizationId } = await params
  const query = await searchParams
  const me = await api<Me>('/auth/me')
  const organization = await api<Organization>(`/organizations/${organizationId}`)
  const search = new URLSearchParams({ pageSize: '50' })
  if (query.q) search.set('q', query.q)
  const contacts = await api<Page<Contact>>(`/organizations/${organizationId}/contacts?${search.toString()}`)
  const operators = platformAdmin(me)
    ? await api<Page<UserRow>>('/admin/users?role=operator&pageSize=100')
    : { items: [] }
  const assigned = await api<Array<{ id: string; name: string; email: string }>>(
    `/organizations/${organizationId}/operators`,
  )
  const operate = canOperateOrg(me, organizationId)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{organization.name}</h1>
        <p className="text-sm text-ink/70">{organization.active ? 'Cliente activo' : 'Cliente inactivo'}</p>
      </div>
      <Notice message={query.aviso} />
      {platformAdmin(me) ? (
        <Card>
          <h2 className="font-medium">Asignar operador</h2>
          <form action={assignOperatorAction} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="organizationId" value={organizationId} />
            <select name="userId" className="field w-auto" required>
              <option value="">Elige un operador</option>
              {operators.items.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            <Button type="submit">Asignar</Button>
          </form>
        </Card>
      ) : null}
      <Card>
        <h2 className="font-medium">Operadores asignados</h2>
        <ul className="mt-3 text-sm text-ink/70">
          {assigned.length === 0 ? <li>Sin operadores asignados.</li> : null}
          {assigned.map((operator) => (
            <li key={operator.id}>
              {operator.name} · {operator.email}
            </li>
          ))}
        </ul>
      </Card>
      {operate ? (
        <Card>
          <h2 className="font-medium">Nuevo contacto</h2>
          <p className="mt-1 text-sm text-ink/60">El teléfono va en E.164. El consentimiento queda en no hasta que lo registres.</p>
          <form action={createContactAction} className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="organizationId" value={organizationId} />
            <Input name="name" placeholder="Nombre" required />
            <Input name="phone" placeholder="+525512345678" required />
            <Button type="submit">Agregar</Button>
          </form>
        </Card>
      ) : null}
      <Card>
        <form className="mb-4 flex gap-2">
          <Input name="q" defaultValue={query.q} placeholder="Buscar contacto" />
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
        <table className="w-full text-left text-sm">
          <thead className="text-ink/60">
            <tr>
              <th className="pb-2 font-medium">Nombre</th>
              <th className="pb-2 font-medium">Teléfono</th>
              <th className="pb-2 font-medium">SMS</th>
              <th className="pb-2 font-medium">Llamada</th>
              <th className="pb-2 font-medium">Opt-out</th>
              {operate ? <th className="pb-2 font-medium">Consentimiento</th> : null}
            </tr>
          </thead>
          <tbody>
            {contacts.items.length === 0 ? (
              <tr>
                <td className="py-6 text-ink/60" colSpan={6}>
                  No hay contactos.
                </td>
              </tr>
            ) : (
              contacts.items.map((contact) => (
                <tr key={contact.id} className="border-t border-line">
                  <td className="py-3">{contact.name}</td>
                  <td className="py-3">{contact.phone}</td>
                  <td className="py-3">{yesNo(contact.smsConsent)}</td>
                  <td className="py-3">{yesNo(contact.callConsent)}</td>
                  <td className="py-3">{yesNo(contact.smsOptOut)}</td>
                  {operate ? (
                    <td className="py-3">
                      <div className="flex gap-2">
                        <form action={consentAction}>
                          <input type="hidden" name="organizationId" value={organizationId} />
                          <input type="hidden" name="contactId" value={contact.id} />
                          <input type="hidden" name="smsConsent" value="true" />
                          <Button type="submit" variant="secondary">
                            SMS
                          </Button>
                        </form>
                        <form action={consentAction}>
                          <input type="hidden" name="organizationId" value={organizationId} />
                          <input type="hidden" name="contactId" value={contact.id} />
                          <input type="hidden" name="callConsent" value="true" />
                          <Button type="submit" variant="secondary">
                            Voz
                          </Button>
                        </form>
                        <form action={placeCallAction}>
                          <input type="hidden" name="organizationId" value={organizationId} />
                          <input type="hidden" name="contactId" value={contact.id} />
                          <Button type="submit">Llamar</Button>
                        </form>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
