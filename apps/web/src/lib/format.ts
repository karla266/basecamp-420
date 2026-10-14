export function formatWhen(value: string | null | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(new Date(value))
}

export function yesNo(value: boolean): string {
  return value ? 'Sí' : 'No'
}
