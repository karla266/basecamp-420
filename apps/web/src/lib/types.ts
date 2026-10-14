export type Membership = {
  organizationId: string | null
  role: 'platform_admin' | 'operator' | 'client_admin' | 'client_viewer'
}

export type Organization = {
  id: string
  name: string
  slug: string
  active: boolean
}

export type Me = {
  user: { id: string; email: string; name: string }
  memberships: Membership[]
  operatorOrganizationIds: string[]
  organizations: Organization[]
  canAccessAdmin: boolean
  canAccessPortal: boolean
}

export type Summary = {
  activeOrganizations: number
  openConversations: number
  callsToday: number
}

export type Page<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export type Contact = {
  id: string
  name: string
  phone: string
  smsConsent: boolean
  callConsent: boolean
  smsOptOut: boolean
}

export type Conversation = {
  id: string
  contactId: string
  contactName: string
  contactPhone: string
  status: string
  updatedAt: string
}

export type Message = {
  id: string
  direction: 'inbound' | 'outbound'
  body: string
  status: string
  createdAt: string
}

export type CallItem = {
  id: string
  status: string
  contactName: string
  contactPhone: string
  createdAt: string
  recordings: Array<{ id: string; url: string; storageKey: string; durationSeconds: number | null }>
}

export type Template = { id: string; name: string; body: string }

export type Automation = {
  id: string
  name: string
  trigger: 'contact_created' | 'manual'
  active: boolean
  steps: Array<{ id: string; waitMinutes: number; templateId: string }>
}

export type UserRow = {
  id: string
  name: string
  email: string
  memberships: Membership[]
}
