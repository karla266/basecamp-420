export function Notice({ message }: { message?: string }) {
  if (!message) return null
  return <p className="rounded-md border border-line bg-[#fff8ee] px-3 py-2 text-sm">{message}</p>
}
