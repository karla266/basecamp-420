'use server'

import { redirect } from 'next/navigation'
import { ApiError, api } from './api'

async function run(path: string, fallback: string, action: () => Promise<void>) {
  try {
    await action()
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    redirect(`${path}?aviso=${encodeURIComponent(error.message || fallback)}`)
  }
  redirect(path)
}

export async function createOrganizationAction(formData: FormData) {
  const path = '/admin/clientes'
  await run(path, 'No se pudo crear', () =>
    api('/organizations', {
      method: 'POST',
      body: JSON.stringify({ name: String(formData.get('name') ?? '') }),
    }),
  )
}

export async function createContactAction(formData: FormData) {
  const organizationId = String(formData.get('organizationId') ?? '')
  const path = `/admin/clientes/${organizationId}`
  await run(path, 'No se pudo crear el contacto', () =>
    api(`/organizations/${organizationId}/contacts`, {
      method: 'POST',
      body: JSON.stringify({
        name: String(formData.get('name') ?? ''),
        phone: String(formData.get('phone') ?? ''),
      }),
    }),
  )
}

export async function consentAction(formData: FormData) {
  const organizationId = String(formData.get('organizationId') ?? '')
  const contactId = String(formData.get('contactId') ?? '')
  const path = `/admin/clientes/${organizationId}`
  const body: { smsConsent?: boolean; callConsent?: boolean } = {}
  if (formData.get('smsConsent') === 'true') body.smsConsent = true
  if (formData.get('callConsent') === 'true') body.callConsent = true
  await run(path, 'No se pudo registrar el consentimiento', () =>
    api(`/organizations/${organizationId}/contacts/${contactId}/consent`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )
}

export async function assignOperatorAction(formData: FormData) {
  const organizationId = String(formData.get('organizationId') ?? '')
  const path = `/admin/clientes/${organizationId}`
  await run(path, 'No se pudo asignar', () =>
    api(`/organizations/${organizationId}/operators`, {
      method: 'POST',
      body: JSON.stringify({ userId: String(formData.get('userId') ?? '') }),
    }),
  )
}

export async function sendMessageAction(formData: FormData) {
  const organizationId = String(formData.get('organizationId') ?? '')
  const conversationId = String(formData.get('conversationId') ?? '')
  const path = `/admin/conversaciones/${conversationId}?org=${organizationId}`
  await run(path, 'No se pudo enviar', () =>
    api(`/organizations/${organizationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        contactId: String(formData.get('contactId') ?? ''),
        body: String(formData.get('body') ?? ''),
      }),
    }),
  )
}

export async function createTemplateAction(formData: FormData) {
  const organizationId = String(formData.get('organizationId') ?? '')
  await run('/admin/automatizaciones', 'No se pudo crear la plantilla', () =>
    api(`/organizations/${organizationId}/templates`, {
      method: 'POST',
      body: JSON.stringify({
        name: String(formData.get('name') ?? ''),
        body: String(formData.get('body') ?? ''),
      }),
    }),
  )
}

export async function createAutomationAction(formData: FormData) {
  const organizationId = String(formData.get('organizationId') ?? '')
  const steps = [0, 1]
    .map((index) => ({
      templateId: String(formData.get(`template${index}`) ?? ''),
      waitMinutes: Number(formData.get(`wait${index}`) ?? 0),
    }))
    .filter((step) => step.templateId)
  await run('/admin/automatizaciones', 'No se pudo crear la automatización', () =>
    api(`/organizations/${organizationId}/automations`, {
      method: 'POST',
      body: JSON.stringify({
        name: String(formData.get('name') ?? ''),
        trigger: String(formData.get('trigger') ?? 'manual'),
        steps,
      }),
    }),
  )
}

export async function placeCallAction(formData: FormData) {
  const organizationId = String(formData.get('organizationId') ?? '')
  await run('/admin/llamadas', 'No se pudo iniciar la llamada', () =>
    api(`/organizations/${organizationId}/calls`, {
      method: 'POST',
      body: JSON.stringify({ contactId: String(formData.get('contactId') ?? '') }),
    }),
  )
}

export async function inviteAction(formData: FormData) {
  const destination = String(formData.get('destination') ?? '/admin/usuarios')
  const organizationId = String(formData.get('organizationId') ?? '')
  try {
    const result = await api<{ acceptPath: string }>('/admin/invitations', {
      method: 'POST',
      body: JSON.stringify({
        email: String(formData.get('email') ?? ''),
        role: String(formData.get('role') ?? ''),
        organizationId: organizationId || null,
      }),
    })
    redirect(`${destination}?aviso=${encodeURIComponent(`Invitación lista: ${result.acceptPath}`)}`)
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`${destination}?aviso=${encodeURIComponent(error.message)}`)
    }
    throw error
  }
}

export async function acceptInviteAction(formData: FormData) {
  try {
    await api('/auth/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({
        token: String(formData.get('token') ?? ''),
        name: String(formData.get('name') ?? ''),
        password: String(formData.get('password') ?? ''),
      }),
    })
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'No se pudo aceptar la invitación'
    redirect(`/invitacion?token=${encodeURIComponent(String(formData.get('token') ?? ''))}&aviso=${encodeURIComponent(message)}`)
  }
  redirect('/login?aviso=Ya puedes iniciar sesión')
}
