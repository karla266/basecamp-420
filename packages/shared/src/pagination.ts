export type Page<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export function pageQuery(input: { page?: number; pageSize?: number }): {
  page: number
  pageSize: number
  skip: number
} {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
  return { page, pageSize, skip: (page - 1) * pageSize }
}
