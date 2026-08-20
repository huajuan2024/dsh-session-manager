import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const generatedLib = fileURLToPath(new URL('../lib/', import.meta.url))
await rm(generatedLib, { recursive: true, force: true })
