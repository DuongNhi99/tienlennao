import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_GAME_RULES,
  type GameRules,
  gameRulesSchema,
  type RoomOptions,
} from '@tienlen/shared';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';

const PRESET_KEY = 'default';
const FALLBACK_TURN_TIMERS = [15, 30, 45];

export interface ActivePreset {
  /** Null when no preset is stored (for example an unseeded database). */
  id: string | null;
  rules: GameRules;
  options: RoomOptions;
}

/** The active rule preset (`game_rule_configurations`) and the room options it allows. */
@Injectable()
export class RulePresetsService {
  private readonly logger = new Logger(RulePresetsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async active(): Promise<ActivePreset> {
    const preset = await this.prisma.gameRuleConfiguration.findFirst({
      where: { key: PRESET_KEY, isActive: true },
      orderBy: { version: 'desc' },
    });
    const rules = preset && gameRulesSchema.safeParse(preset.rules);
    if (!preset || !rules?.success) {
      if (preset) this.logger.error(`Rule preset ${preset.id} is invalid; using built-in rules.`);
      return { id: null, rules: DEFAULT_GAME_RULES, options: this.options([0], []) };
    }
    return {
      id: preset.id,
      rules: rules.data,
      options: this.options(preset.allowedEntryFees, preset.allowedTurnTimers),
    };
  }

  /** The rules a room plays by: its stored preset, or the built-in default. */
  async rulesFor(ruleConfigId: string | null): Promise<GameRules> {
    if (!ruleConfigId) return DEFAULT_GAME_RULES;
    const preset = await this.prisma.gameRuleConfiguration.findUnique({
      where: { id: ruleConfigId },
    });
    const parsed = gameRulesSchema.safeParse(preset?.rules);
    if (!parsed.success) {
      throw new AppException('INTERNAL_ERROR', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return parsed.data;
  }

  /** Throws VALIDATION_ERROR unless both values are offered by the active preset. */
  assertAllowed(options: RoomOptions, entryFee: number, turnTimerSeconds: number): void {
    const problems = [
      !options.entryFees.includes(entryFee) && {
        path: 'entryFee',
        message: 'Mức cược không hợp lệ.',
      },
      !options.turnTimers.includes(turnTimerSeconds) && {
        path: 'turnTimerSeconds',
        message: 'Thời gian lượt không hợp lệ.',
      },
    ].filter((problem) => problem !== false);
    if (problems.length)
      throw new AppException('VALIDATION_ERROR', HttpStatus.BAD_REQUEST, problems);
  }

  private options(entryFees: number[], turnTimers: number[]): RoomOptions {
    return {
      entryFees: entryFees.length ? [...entryFees].sort((a, b) => a - b) : [0],
      turnTimers: turnTimers.length ? [...turnTimers].sort((a, b) => a - b) : FALLBACK_TURN_TIMERS,
    };
  }
}
