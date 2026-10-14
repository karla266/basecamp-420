import { Notice } from '@/components/notice'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { inviteAction } from '@/lib/actions'
import { api } from '@/lib/api'
import { currentOrganization, platformAdmin } from '@/lib/org'
import type { Me, Page, UserRow } from '@/lib/types'

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams
  const me = await api<Me>('/auth/me')
  if (!platformAdmin(me)) return <p>Esta sección es solo para administración de plataforma.</p>
  const organization = await currentOrganization(me)
  const users = await api<Page<UserRow>>('/admin/users?pageSize=100')
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Usuarios</h1>
      <Notice message={aviso} />
      <Card>
        <form action={inviteAction} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="destination" value="/admin/usuarios" />
          <input type="hidden" name="organizationId" value={organization?.id ?? ''} />
          <label className="space-y-1 text-sm">
            <span>Correo</span>
            <Input name="email" type="email" required />
          </label>
          <label className="space-y-1 text-sm">
            <span>Rol</span>
            <select name="role" className="field">
              <option value="operator">Operador</option>
              <option value="platform_admin">Administración de plataforma</option>
              <option value="client_admin">Admin del cliente</option>
              <option value="client_viewer">Lectura del cliente</option>
            </select>
          </label>
          <Button type="submit">Crear invitación</Button>
        </form>
      </Card>
      <ul className="space-y-2 text-sm">
        {users.items.map((user) => (
          <li key={user.id}>
            {user.name} · {user.email}
          </li>
        ))}
      </ul>
    </div>
  )
}
