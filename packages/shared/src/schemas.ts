import { z } from 'zod'
import { isE164 } from './phone'
import { ROLES } from './permissions'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
})

export const paginationSchema = z.object({
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
})

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  active: z.boolean().optional(),
})

export const createContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().refine(isE164, 'El teléfono debe estar en formato E.164'),
})

export const updateContactSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().refine(isE164, 'El teléfono debe estar en formato E.164').optional(),
})

export const consentSchema = z
  .object({
    smsConsent: z.boolean().optional(),
    callConsent: z.boolean().optional(),
  })
  .refine((value) => value.smsConsent !== undefined || value.callConsent !== undefined, {
    message: 'Indica el consentimiento que quieres registrar',
  })

export const assignOperatorSchema = z.object({
  userId: z.string().min(1),
})

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(640),
})

export const sendMessageSchema = z.object({
  contactId: z.string().min(1),
  body: z.string().trim().min(1).max(640),
})

export const createAutomationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  trigger: z.enum(['contact_created', 'manual']),
  steps: z
    .array(
      z.object({
        templateId: z.string().min(1),
        waitMinutes: z.number().int().min(0).max(10080),
      }),
    )
    .min(1)
    .max(10),
})

export const startAutomationSchema = z.object({
  contactId: z.string().min(1),
})

export const createCallSchema = z.object({
  contactId: z.string().min(1),
})

export const invitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(ROLES),
  organizationId: z.string().min(1).nullable().optional(),
})

export const acceptInviteSchema = z.object({
  token: z.string().min(20),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
})

export const selectOrganizationSchema = z.object({
  organizationId: z.string().min(1),
})
