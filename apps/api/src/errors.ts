export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class DuplicateError extends Error {
  constructor() {
    super('duplicate')
    this.name = 'DuplicateError'
  }
}

export const Errors = {
  unauthorized: () => new AppError(401, 'Correo o contraseña incorrectos', 'unauthorized'),
  session: () => new AppError(401, 'Inicia sesión', 'unauthorized'),
  forbidden: () => new AppError(403, 'No tienes acceso a esta organización', 'forbidden'),
  notFound: (entity = 'Recurso') => new AppError(404, `${entity} no encontrado`, 'not_found'),
  badRequest: (message: string) => new AppError(400, message, 'bad_request'),
  conflict: (message: string) => new AppError(409, message, 'conflict'),
  rateLimit: () =>
    new AppError(429, 'Se alcanzó el límite de envíos de esta organización', 'rate_limit'),
  unavailable: (message: string) => new AppError(503, message, 'unavailable'),
}
