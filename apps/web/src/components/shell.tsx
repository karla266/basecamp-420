import Link from 'next/link'
import type { ReactNode } from 'react'
import { LogoutButton } from './logout-button'
import type { Me } from '@/lib/types'

const adminLinks = [
  { href: '/admin', label: 'Resumen' },
  { href: '/admin/clientes', label: 'Clientes' },
  { href: '/admin/conversaciones', label: 'Conversaciones' },
  { href: '/admin/llamadas', label: 'Llamadas' },
  { href: '/admin/automatizaciones', label: 'Automatizaciones' },
  { href: '/admin/usuarios', label: 'Usuarios' },
]

const portalLinks = [
  { href: '/portal', label: 'Inicio' },
  { href: '/portal/conversaciones', label: 'Conversaciones' },
  { href: '/portal/llamadas', label: 'Llamadas' },
  { href: '/portal/usuarios', label: 'Usuarios' },
]

export function Shell({
  me,
  area,
  selectedId,
  children,
}: {
  me: Me
  area: 'admin' | 'portal'
  selectedId?: string
  children: ReactNode
}) {
  const links = area === 'admin' ? adminLinks : portalLinks.filter((link) => link.href !== '/portal/usuarios' || me.memberships.some((item) => item.role === 'client_admin'))
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="bg-ink text-[#f3efe6] md:min-h-screen">
        <div className="flex items-center justify-between px-5 py-5 md:block">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#c8bfae]">Basecamp</p>
            <p className="text-lg font-semibold">420</p>
          </div>
          <LogoutButton />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-4 md:block md:space-y-1">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="block whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-white/10">
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <p className="text-sm text-ink/60">{me.user.name}</p>
            <p className="text-xs text-ink/50">{me.user.email}</p>
          </div>
          {me.organizations.length > 1 ? (
            <form action="/org" method="post" className="flex items-center gap-2">
              <label className="text-sm" htmlFor="organizationId">
                Organización
              </label>
              <select id="organizationId" name="organizationId" defaultValue={selectedId ?? me.organizations[0]?.id} className="field w-auto">
                {me.organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
              <button className="rounded-md border border-line bg-white px-3 py-2 text-sm" type="submit">
                Ver
              </button>
            </form>
          ) : null}
        </header>
        <main className="space-y-6 px-6 py-6">{children}</main>
      </div>
    </div>
  )
}
