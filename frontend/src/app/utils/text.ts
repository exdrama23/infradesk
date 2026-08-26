export function truncar(texto: string | null | undefined, limite = 50): string {
  if (!texto) {
    return '';
  }
  return texto.length > limite ? `${texto.slice(0, limite).trimEnd()}...` : texto;
}