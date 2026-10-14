import { LoginForm } from '@/components/login-form'
import { Notice } from '@/components/notice'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>
}) {
  const { aviso } = await searchParams
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-xs uppercase tracking-[0.18em] text-moss">Basecamp 420</p>
      <h1 className="mt-2 text-3xl font-semibold">Entrar a operaciones</h1>
      <div className="mt-6">
        <Notice message={aviso} />
        <LoginForm />
      </div>
    </main>
  )
}
