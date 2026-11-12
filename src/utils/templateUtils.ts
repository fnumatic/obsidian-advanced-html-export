/**
 * Template Utility Functions
 */

export function fillTemplate(template: string, data: Record<string, string>): string {
    return template.replace(/\{\{([A-Z_]+)\}\}/g, (_match: string, key: string) => data[key] || '');
}
