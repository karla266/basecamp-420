'use client'

export function LogoutButton() {
  async function logout() {
    await fetch('/backend/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <button className="text-sm text-[#f3efe6]/80 underline-offset-2 hover:underline" onClick={() => void logout()} type="button">
      Cerrar sesión
    </button>
  )
}
