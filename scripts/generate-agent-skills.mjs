/**
 * Generates the Agent Skills discovery index.
 *
 * Reads every SKILL.md under public/.well-known/agent-skills/ and writes
 * public/.well-known/agent-skills/index.json — the discovery manifest
 * (agentskills.io discovery schema 0.2.0) that lets an agent find this
 * site's skills without being handed their URLs.
 *
 * Runs in the `prebuild` npm script, so the index — and every digest in it —
 * always matches the SKILL.md files currently on disk. Never hand-edit
 * index.json; edit the SKILL.md files and rebuild.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  '.well-known',
  'agent-skills',
);

// Pull `name` and `description` out of a SKILL.md YAML frontmatter block.
function frontmatter(md, label) {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`${label}: no YAML frontmatter`);
  const fields = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([a-z-]+):\s*(.+)$/i);
    if (m) fields[m[1]] = m[2].trim();
  }
  return fields;
}

const skills = readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .map((name) => {
    const file = join(skillsDir, name, 'SKILL.md');
    if (!existsSync(file)) throw new Error(`${name}: missing SKILL.md`);

    const bytes = readFileSync(file);
    const fm = frontmatter(bytes.toString('utf8'), `${name}/SKILL.md`);

    if (fm.name !== name) {
      throw new Error(`${name}/SKILL.md: frontmatter name "${fm.name}" != directory`);
    }
    if (!fm.description) throw new Error(`${name}/SKILL.md: no description`);
    if (fm.description.length > 125) {
      throw new Error(`${name}/SKILL.md: description exceeds 125 characters`);
    }

    return {
      name,
      type: 'skill-md',
      description: fm.description,
      url: `/.well-known/agent-skills/${name}/SKILL.md`,
      digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
    };
  });

if (skills.length === 0) {
  throw new Error('No skills found — refusing to write an empty index.json');
}

const index = {
  $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
  skills,
};

writeFileSync(join(skillsDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`[agent-skills] wrote index.json with ${skills.length} skill(s)`);
