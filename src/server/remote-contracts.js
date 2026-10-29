import { z } from 'zod';
import { schema } from '../core/project-core.js';
import { skillBundle } from '#senda/skill';

export const referenceNames = ['SKILL.md', ...['interviewing','remote','review-and-iteration','readability','modeling-patterns','methodology','commands','planning'].map(n => `references/${n}.md`)];
export const methodInput = z.strictObject({ reference: z.enum([...referenceNames, 'all']).optional() });
export const methodOutput = z.strictObject({
  documents: z.object(Object.fromEntries(referenceNames.map(n => [n, z.string().optional()]))).strict(),
  availableReferences: z.array(z.enum(referenceNames)),
  instructions: z.string(),
});
export async function remoteMethod({ reference = 'SKILL.md' } = {}) {
  const files = await skillBundle();
  return methodOutput.parse({
    documents: reference === 'all' ? files : { [reference]: files[reference] },
    availableReferences: referenceNames,
    instructions: 'Read the skill first, then request each linked reference you need by its exact reference name. Do not skip the discovery or evidence requirements. reference=all retrieves the complete bundle when needed.',
  });
}

const installed = schema();
const operationNames = installed.operations.$defs.op.oneOf.map(r => r.$ref.split('/').at(-1));
export const modelSchemaInput = z.strictObject({
  section: z.enum(['proposal', 'full']).optional(),
  operation: z.enum(operationNames).optional(),
});
export const modelSchemaOutput = z.strictObject({
  section: z.enum(['proposal', 'operation', 'full']),
  operation: z.enum(operationNames).optional(),
  proposal: z.record(z.string(), z.unknown()).optional(),
  operations: z.record(z.string(), z.unknown()).optional(),
  operationIndex: z.array(z.strictObject({ name: z.enum(operationNames), description: z.string() })).optional(),
  instructions: z.string(),
});
function operationSchema(name) {
  const definitions = {}, pending = [name];
  function references(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string' && value.$ref.startsWith('#/$defs/')) pending.push(value.$ref.slice(8));
    for (const item of Object.values(value)) references(item);
  }
  while (pending.length) {
    const key = pending.pop();
    if (Object.hasOwn(definitions, key)) continue;
    const value = installed.operations.$defs[key];
    if (!value) throw new Error('An installed operation schema reference is unavailable.');
    definitions[key] = value; references(value);
  }
  return { $schema: installed.operations.$schema, $ref: `#/$defs/${name}`, $defs: definitions };
}
export function remoteModelSchema({ section = 'proposal', operation } = {}) {
  const instructions = 'Use this exact proposal contract. Request operation=<name> for every operation you will use; each result includes its referenced definitions. section=full retrieves the entire installed contract. Never guess operation fields.';
  if (operation) return modelSchemaOutput.parse({ section: 'operation', operation, operations: operationSchema(operation), instructions });
  if (section === 'full') return modelSchemaOutput.parse({ section, ...installed, instructions });
  return modelSchemaOutput.parse({ section, proposal: installed.proposal,
    operationIndex: operationNames.map(name => ({ name, description: installed.operations.$defs[name].description || name })), instructions });
}
