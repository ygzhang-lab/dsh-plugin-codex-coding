/**
 * The published DSH packages currently ship runtime JavaScript without their
 * `.d.ts` files. These minimal declarations cover the APIs this plugin uses so
 * the plugin can still be developed with strict TypeScript.
 */
declare module '@deepseek-ai/cordis' {
  export class Service {
    constructor(ctx: any, name: string)
  }
}

declare module '@deepseek-ai/schemastery' {
  const z: any
  export default z
}

declare module '@deepseek-ai/dsh-tools' {
  export function defineTool<T>(definition: T): T
}

declare module '@deepseek-ai/dsh-llm' {
  export function ReasoningEffortId(value: string): string
}
