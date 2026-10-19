// Writes src/assets/help-index.json: the ordered help topic list for the in-app viewer.
// Source of truth is docs/help; everything written here is generated and git-ignored.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const helpDir = join(here, '..', '..', '..', 'docs', 'help')
const assets = join(here, '..', 'src', 'assets')
const out = join(assets, 'help-index.json')

// angular.json assets cannot reach outside the workspace, so mirror docs/help (minus the sample collection) into git-ignored src/assets/help
rmSync(join(assets, 'help'), { recursive: true, force: true })
cpSync(helpDir, join(assets, 'help'), { recursive: true, filter: src => relative(helpDir, src).split(sep)[0] !== 'sample-collection' })

const titleOf = (file, fallback) => {
    const m = /^#\s+(.+?)\s*$/m.exec(readFileSync(join(helpDir, file), 'utf8'))
    return m ? m[1] : fallback
}

const guides = readdirSync(helpDir).filter(f => /^\d\d-.+\.md$/.test(f)).sort()
const topics = [
    { slug: 'help-home', title: 'Help home', file: 'README.md' },
    ...guides.map(file => {
        const slug = file.replace(/^\d\d-/, '').replace(/\.md$/, '')
        return { slug, title: titleOf(file, slug), file }
    }),
]
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(topics, null, 2) + '\n')
console.log(`help-index: ${topics.length} topics -> ${out}`)
