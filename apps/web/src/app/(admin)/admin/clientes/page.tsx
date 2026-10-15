import Link from 'next/link'
import { Notice } from '@/components/notice'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createOrganizationAction } from '@/lib/actions'
import { api } from '@/lib/api'
import { platformAdmin } from '@/lib/org'
import type { Me, Organization, Page } from '@/lib/types'

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; aviso?: string }>
}) {
  const params = await searchParams
  const me = await api<Me>('/auth/me')
  const page = params.page ?? '1'
  const query = new URLSearchParams({ page, pageSize: '20' })
  if (params.q) query.set('q', params.q)
  const result = await api<Page<Organization>>(`/organizations?${query.toString()}`)
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-ink/70">Organizaciones que atiende el equipo.</p>
        </div>
        <form className="flex gap-2" action="/admin/clientes">
          <label className="sr-only" htmlFor="buscar-clientes">
            Buscar clientes
          </label>
          <Input id="buscar-clientes" name="q" defaultValue={params.q} placeholder="Buscar" />
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
      </div>
      <Notice message={params.aviso} />
      {platformAdmin(me) ? (
        <Card>
          <form action={createOrganizationAction} className="flex flex-wrap items-end gap-3">
            <label className="min-w-64 flex-1 space-y-1 text-sm">
              <span>Nuevo cliente</span>
              <Input name="name" placeholder="Nombre de la organización" required minLength={2} />
            </label>
            <Button type="submit">Crear</Button>
          </form>
        </Card>
      ) : null}
      <Card>
        <table className="w-full text-left text-sm">
          <thead className="text-ink/60">
            <tr>
              <th className="pb-2 font-medium" scope="col">
                Nombre
              </th>
              <th className="pb-2 font-medium" scope="col">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {result.items.length === 0 ? (
              <tr>
                <td className="py-6 text-ink/60" colSpan={2}>
                  No hay clientes en tu alcance.
                </td>
              </tr>
            ) : (
              result.items.map((organization) => (
                <tr key={organization.id} className="border-t border-line">
                  <td className="py-3">
                    <Link className="font-medium underline-offset-2 hover:underline" href={`/admin/clientes/${organization.id}`}>
                      {organization.name}
                    </Link>
                  </td>
                  <td className="py-3">{organization.active ? 'Activo' : 'Inactivo'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="mt-4 text-sm text-ink/60">
          {result.total} en total · página {result.page}
        </p>
      </Card>
    </div>
  )
}
