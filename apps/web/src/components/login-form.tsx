'use client'

import { FormEvent, useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'

export function LoginForm() {
  const [error, setError] = useState('')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const data = new FormData(event.currentTarget)
    const response = await fetch('/backend/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: String(data.get('email') ?? ''),
        password: String(data.get('password') ?? ''),
      }),
    })
    if (!response.ok) {
      setError('Correo o contraseña incorrectos')
      return
    }
    const me = (await fetch('/backend/auth/me').then((item) => item.json())) as {
      canAccessAdmin?: boolean
      canAccessPortal?: boolean
    }
    window.location.href = me.canAccessAdmin ? '/admin' : '/portal'
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
      {error ? (
        <p className="text-sm text-clay" role="alert">
          {error}
        </p>
      ) : null}
      <label className="block space-y-1 text-sm">
        <span>Correo</span>
        <Input name="email" type="email" autoComplete="username" required />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Contraseña</span>
        <Input name="password" type="password" autoComplete="current-password" minLength={8} required />
      </label>
      <Button className="w-full" type="submit">
        Entrar
      </Button>
    </form>
  )
}
