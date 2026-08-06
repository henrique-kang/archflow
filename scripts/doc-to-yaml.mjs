// Converte um Doc (JSON) exportado do store em YAML no formato do ArchFlow.
// Uso: node scripts/doc-to-yaml.mjs <entrada.json> <saida.yaml>
import { dump } from 'js-yaml'
import fs from 'node:fs'

const [, , input, output] = process.argv
const doc = JSON.parse(fs.readFileSync(input, 'utf8'))
let text = dump(doc, { lineWidth: 200, noRefs: true, flowLevel: 3 })
text = text.replace(/(\{x: -?[\d.]+, )'y':(?= -?[\d.])/g, '$1y:')
fs.mkdirSync(output.replace(/[/\\][^/\\]+$/, ''), { recursive: true })
fs.writeFileSync(output, text)
console.log(`YAML salvo em ${output} (${text.split('\n').length} linhas)`)
