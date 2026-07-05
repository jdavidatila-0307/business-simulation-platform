// Motor SimNego V2 — errores controlados compartidos por todos los núcleos.
// Ningún núcleo debe lanzar Error genérico para condiciones de dominio: siempre
// KernelError con un código de la lista cerrada que cada núcleo declara.
class KernelError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'KernelError';
    this.code = code;
    this.details = details;
  }
}

module.exports = { KernelError };
