import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { normalizeOptions, type CodingOptions } from './config.js'

/**
 * Host-side settings surface. The Coding preset reads this service; the Web
 * settings page writes the same volatile fields through the settings service.
 * The service performs no agent work by itself, so installing the bundle does
 * not change any session until a session selects the Coding preset.
 */
export default class DshCodingService extends Service {
  static Config = z.object({
    reasoning: z.union(['auto', 'low', 'high', 'max'] as const).default('auto').volatile(),
    localSkills: z.boolean().default(true).volatile(),
    // The conversation language. auto follows the DSH interface locale, then
    // the host locale; zh/en pin it. Only these two languages ship.
    language: z.union(['auto', 'zh', 'en'] as const).default('auto').volatile(),
    disabledPlugins: z.array(z.string()).default([]).volatile(),
  })

  private readonly config: any

  constructor(ctx: any, config: any) {
    super(ctx, 'dshCoding')
    this.config = config
    ctx.inject(['settings'], (child: any) => {
      child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
    })
  }

  get options(): CodingOptions {
    return normalizeOptions({
      reasoning: this.config.reasoning.get(),
      localSkills: this.config.localSkills.get(),
      language: this.config.language.get(),
      disabledPlugins: this.config.disabledPlugins.get(),
    })
  }
}
