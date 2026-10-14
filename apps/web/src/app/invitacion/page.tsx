import { acceptInviteAction } from '@/lib/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/notice'

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; aviso?: string }>
}) {
  const { token = '', aviso } = await searchParams
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Aceptar invitación</h1>
      <p className="mt-2 text-sm text-ink/70">Crea tu acceso. Si el correo ya existe, se agrega el rol a esa cuenta.</p>
      <Notice message={aviso} />
      <form action={acceptInviteAction} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <label className="block space-y-1 text-sm">
          <span>Nombre</span>
          <Input name="name" required />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Contraseña</span>
          <Input name="password" type="password" minLength={8} required />
        </label>
        <Button type="submit">Crear acceso</Button>
      </form>
    </main>
  )
}
