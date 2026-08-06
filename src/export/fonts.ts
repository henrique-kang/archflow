// Embute as fontes do app no SVG exportado como data: URI base64 — assim o SVG standalone
// e o PNG rasterizado ficam pixel-perfect mesmo em máquinas sem Inter/JetBrains Mono
// instaladas. Os woff2 são os mesmos servidos pelo Vite para a UI (@fontsource), importados
// com `?url` para obtermos a URL do asset em dev e em build.
import interLatinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import monoLatin400Url from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url'
import monoLatin500Url from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2?url'

/** Baixa um asset (servido pelo próprio app) e converte para data: URI base64. */
async function toDataUri(url: string, mime: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${url}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  // btoa exige string "binária"; converte em blocos para não estourar o limite de argumentos
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return `data:${mime};base64,${btoa(bin)}`
}

async function build(): Promise<string> {
  const [inter, mono400, mono500] = await Promise.all([
    toDataUri(interLatinUrl, 'font/woff2'),
    toDataUri(monoLatin400Url, 'font/woff2'),
    toDataUri(monoLatin500Url, 'font/woff2'),
  ])
  return [
    // Inter Variable cobre todos os pesos usados na UI (100–900) num único arquivo
    `@font-face { font-family: 'Inter Variable'; font-style: normal; font-weight: 100 900; src: url(${inter}) format('woff2-variations'); }`,
    `@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 400; src: url(${mono400}) format('woff2'); }`,
    `@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 500; src: url(${mono500}) format('woff2'); }`,
  ].join('\n')
}

let cached: Promise<string> | null = null

/**
 * Regras @font-face com as fontes embutidas, prontas para entrar no <style> do SVG exportado.
 * Memoizado em módulo (as fontes não mudam durante a sessão, e o base64 é caro de montar).
 * Em caso de falha de fetch resolve para string vazia — o export segue sem fontes embutidas
 * (fallback do sistema) — e a próxima chamada tenta de novo. Nunca lança.
 */
export async function buildFontFaceCss(): Promise<string> {
  cached ??= build().catch(() => {
    cached = null // permite nova tentativa num próximo export
    return ''
  })
  return cached
}
