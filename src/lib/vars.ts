import type { AnyNode, ArchNodeData, OrthoEdge } from '../model/types'

/**
 * Interpola `{{nome}}` com as variáveis do diagrama. Nome desconhecido fica
 * como está (o autor vê que falta declarar).
 */
export function interpolate(text: string, variables: Record<string, string>): string {
  if (!text || !text.includes('{{')) return text
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (raw, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : raw,
  )
}

/** Valor declarado de uma var do nó (undefined se não existe). */
export function nodeVarValue(data: ArchNodeData | undefined, name: string): string | boolean | undefined {
  return data?.vars?.[name]?.value
}

/**
 * A aresta "vale" agora? Sem `when` → sempre. Com `when` → compara com a var
 * declarada no nó de ORIGEM (var inexistente conta como false/não-casa).
 */
export function edgeActive(edge: OrthoEdge, sourceNode: AnyNode | undefined): boolean {
  const when = edge.data?.when
  if (!when) return true
  const value = nodeVarValue(sourceNode?.data as ArchNodeData | undefined, when.var)
  if (value === undefined) return false
  // coerção amigável: YAML pode trazer equals: "true" contra var booleana
  if (typeof value === 'boolean' && typeof when.equals === 'string') {
    return value === (when.equals.toLowerCase() === 'true')
  }
  if (typeof value === 'string' && typeof when.equals === 'boolean') {
    return value.toLowerCase() === String(when.equals)
  }
  return value === when.equals
}

/** Rótulo curto da condição para exibir no canvas: `[var = valor]`. */
export function whenLabel(edge: OrthoEdge): string | null {
  const when = edge.data?.when
  if (!when) return null
  return `${when.var} = ${String(when.equals)}`
}

export function isDown(node: AnyNode | undefined): boolean {
  return (node?.data as ArchNodeData | undefined)?.status === 'down'
}
