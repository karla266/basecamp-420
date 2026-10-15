'use client'

export function LogoutButton() {
  async function logout() {
    await fetch('/backend/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <button
      className="text-sm text-paper/80 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
      onClick={() => void logout()}
      type="button"
    >
      Cerrar sesión
    </button>
  )
}
