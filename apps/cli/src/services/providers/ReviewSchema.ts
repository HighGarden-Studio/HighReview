
export const ReviewResponseSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Brief overview of the review' },
    criticalIssues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { type: 'string', enum: ['critical'] },
          category: { type: 'string' },
          message: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['file', 'line', 'severity', 'category', 'message'],
        additionalProperties: false
      },
    },
    warnings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { type: 'string', enum: ['warning'] },
          category: { type: 'string' },
          message: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['file', 'line', 'severity', 'category', 'message'],
        additionalProperties: false
      },
    },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { type: 'string', enum: ['suggestion'] },
          category: { type: 'string' },
          message: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['file', 'line', 'severity', 'category', 'message'],
        additionalProperties: false
      },
    },
    changeIntents: {
      type: 'array',
      description: 'CRITICAL: Create ONE object per modified file. If 13 files are modified, this array MUST have 13 objects. Do NOT group multiple files into one object.',
      items: {
        type: 'object',
        properties: {
          file: { 
            type: 'string', 
            description: 'EXACT file path ONLY. Do NOT list multiple files. ONE file per object.' 
          },
          level: { type: 'string', enum: ['file', 'block'] },
          intent: { 
            type: 'string', 
            description: 'Single sentence intent for THIS file ONLY. STRICTLY NO MARKDOWN (no **, no ##, no -). Do NOT combine multiple files. Max 100 chars.' 
          },
          motivation: { 
            type: 'string',
            description: 'Brief reason for this change. STRICTLY NO MARKDOWN. Max 100 chars.'
          },
          impact: { 
            type: 'string',
            description: 'Impact of this specific change. STRICTLY NO MARKDOWN. Max 100 chars.'
          },
        },
        required: ['file', 'level', 'intent', 'motivation'],
        additionalProperties: false
      },
    },
    callStacks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          function: { type: 'string' },
          file: { type: 'string' },
          flowchart: { type: 'string', description: 'Mermaid flowchart code. No markdown code block wrapper.' },
          sequence: { type: 'string', description: 'Mermaid sequence diagram code. No markdown code block wrapper.' },
        },
        required: ['function', 'file'],
        additionalProperties: false
      },
    },
    impactAnalysis: {
      type: 'object',
      description: 'Structured impact analysis. Fill each field separately. Do NOT dump all text into affectedAreas.',
      properties: {
        scope: { 
          type: 'string',
          description: 'One of: Module, Project, or External. Single word only.'
        },
        affectedAreas: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'List of specific module names or UI areas. Each item: SHORT string (max 50 chars), NO MARKDOWN, NO bullet points. Example: ["Login UI", "User Service", "API Layer"]'
        },
        breakingChanges: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'List of breaking changes. Each item: SHORT string, NO MARKDOWN. If none, return empty array [].'
        },
        sideEffects: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'List of side effects. Each item: SHORT string, NO MARKDOWN. If none, return empty array [].'
        },
      },
      required: ['scope', 'affectedAreas'],
      additionalProperties: false
    },
    movedCode: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          lines: { type: 'number' },
        },
        required: ['from', 'to', 'lines'],
        additionalProperties: false
      },
    },
    refactorings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          description: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
        },
        required: ['type', 'description', 'files'],
        additionalProperties: false
      },
    },
  },
  required: ['summary', 'criticalIssues', 'warnings', 'suggestions'],
  additionalProperties: false
};
