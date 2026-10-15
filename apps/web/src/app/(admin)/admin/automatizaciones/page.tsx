import { Notice } from '@/components/notice'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createAutomationAction, createTemplateAction } from '@/lib/actions'
import { api } from '@/lib/api'
import { canOperateOrg, currentOrganization } from '@/lib/org'
import type { Automation, Me, Template } from '@/lib/types'

export default async function AutomationsPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams
  const me = await api<Me>('/auth/me')
  const organization = await currentOrganization(me)
  if (!organization) return <p>Selecciona una organización para automatizar.</p>
  const templates = await api<Template[]>(`/organizations/${organization.id}/templates`)
  const automations = await api<Automation[]>(`/organizations/${organization.id}/automations`)
  const operate = canOperateOrg(me, organization.id)
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Automatizaciones</h1>
      <Notice message={aviso} />
      {operate ? (
        <Card>
          <h2 className="mb-3 font-medium">Plantilla</h2>
          <form action={createTemplateAction} className="grid gap-3">
            <input type="hidden" name="organizationId" value={organization.id} />
            <label className="space-y-1 text-sm">
              <span>Nombre</span>
              <Input name="name" required />
            </label>
            <label className="space-y-1 text-sm">
              <span>Mensaje</span>
              <textarea name="body" className="field min-h-24" defaultValue="Hola {{name}}" required />
            </label>
            <Button type="submit">Guardar plantilla</Button>
          </form>
        </Card>
      ) : null}
      {operate ? (
        <Card>
          <h2 className="mb-3 font-medium">Secuencia</h2>
          <form action={createAutomationAction} className="grid gap-3">
            <input type="hidden" name="organizationId" value={organization.id} />
            <label className="space-y-1 text-sm">
              <span>Nombre</span>
              <Input name="name" required />
            </label>
            <label className="space-y-1 text-sm">
              <span>Activación</span>
              <select name="trigger" className="field">
                <option value="contact_created">Al dar consentimiento SMS</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Plantilla</span>
              <select name="template0" className="field" required defaultValue="">
                <option value="" disabled>
                  Plantilla del primer paso
                </option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Espera en minutos</span>
              <Input name="wait0" type="number" min={0} defaultValue={0} />
            </label>
            <Button type="submit">Crear secuencia</Button>
          </form>
        </Card>
      ) : null}
      <ul className="space-y-2 text-sm">
        {automations.map((automation) => (
          <li key={automation.id}>
            {automation.name} · {automation.trigger} · {automation.steps.length} pasos
          </li>
        ))}
      </ul>
    </div>
  )
}
