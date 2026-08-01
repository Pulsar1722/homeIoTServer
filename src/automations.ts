import fs from 'fs';
import { z } from 'zod';

export const AUTOMATIONS_FILENAME = './automations.json';
export const DEFAULT_AUTOMATIONS_FILENAME = './automations.default.json';

const commandActionSchema = z.object({
    type: z.literal('command'),
    deviceName: z.string().trim().min(1).max(200),
    command: z.string().trim().min(1).max(100),
    parameter: z.string().max(500).optional().default('default'),
    commandType: z.enum(['command', 'customize']).optional().default('command'),
    when: z.enum(['always', 'dark']).optional().default('always'),
    enabled: z.boolean().optional().default(true),
});

const waitActionSchema = z.object({
    type: z.literal('wait'),
    durationMs: z.number().int().min(0).max(60_000),
    enabled: z.boolean().optional().default(true),
});

const automationSchema = z.object({
    oneMemberArrivedHome: z.array(z.discriminatedUnion('type', [commandActionSchema, waitActionSchema])).max(50),
});

export type ArrivalAction = z.infer<typeof automationSchema>['oneMemberArrivedHome'][number];
export type Automations = z.infer<typeof automationSchema>;

export function loadAutomations(): Automations {
    const filename = fs.existsSync(AUTOMATIONS_FILENAME)
        ? AUTOMATIONS_FILENAME
        : fs.existsSync(DEFAULT_AUTOMATIONS_FILENAME)
            ? DEFAULT_AUTOMATIONS_FILENAME
            : null;

    if (filename === null) {
        return { oneMemberArrivedHome: [] };
    }

    const parsed: unknown = JSON.parse(fs.readFileSync(filename, 'utf-8'));
    return automationSchema.parse(parsed);
}

export function saveAutomations(value: unknown): Automations {
    const automations = automationSchema.parse(value);
    fs.writeFileSync(AUTOMATIONS_FILENAME, `${JSON.stringify(automations, null, 2)}\n`, 'utf-8');
    return automations;
}
