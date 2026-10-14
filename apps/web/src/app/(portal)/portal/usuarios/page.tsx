import { Notice } from '@/components/notice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { inviteAction } from '@/lib/actions'
import { api } from '@/lib/api'
import { currentOrganization } from '@/lib/org'
import type { Me, Page, UserRow } from '@/lib/types'

export default async function PortalUsersPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams
  const me = await api<Me>('/auth/me')
  const allowed = me.memberships.some((membership) => membership.role === 'client_admin')
  if (!allowed) return <p>Solo el admin del cliente puede invitar.</p>
  const organization = await currentOrganization(me)
  const users = await api<Page<UserRow>>(
    `/admin/users?pageSize=100${organization ? `&organizationId=${organization.id}` : ''}`,
  )
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Equipo</h1>
      <Notice message={aviso} />
      <form action={inviteAction} className="grid max-w-lg gap-3">
        <input type="hidden" name="destination" value="/portal/usuarios" />
        <input type="hidden" name="organizationId" value={organization?.id ?? ''} />
        <Input name="email" type="email" placeholder="Correo" required />
        <select name="role" className="field">
          <option value="client_viewer">Lectura</option>
          <option value="client_admin">Admin del cliente</option>
        </select>
        <Button type="submit">Invitar</Button>
      </form>
      <ul className="text-sm">
        {users.items.map((user) => (
          <li key={user.id}>
            {user.name} · {user.email}
          </li>
        ))}
      </ul>
    </div>
  )
}
