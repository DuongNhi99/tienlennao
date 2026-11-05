import { z } from 'zod';
import { MIN_PLAYERS_PER_MATCH, PLAYERS_PER_MATCH } from '../constants/game';
import { gameRulesSchema } from '../game/rules';

/** Join codes avoid look-alike characters (no I, O, 0, 1). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_NAME_MAX = 48;
export const ROOM_PASSWORD_MIN = 4;
export const ROOM_PASSWORD_MAX = 32;

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(
    z
      .string()
      .regex(
        new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`),
        `Mã phòng gồm ${ROOM_CODE_LENGTH} ký tự chữ và số.`,
      ),
  );

export const roomVisibilitySchema = z.enum(['PUBLIC', 'PRIVATE']);
export type RoomVisibility = z.infer<typeof roomVisibilitySchema>;

/** Empty strings from form inputs become `undefined`. */
const optionalRoomPassword = z
  .string()
  .transform((value) => value || undefined)
  .pipe(
    z
      .string()
      .min(ROOM_PASSWORD_MIN, `Mật khẩu phòng phải có ít nhất ${ROOM_PASSWORD_MIN} ký tự.`)
      .max(ROOM_PASSWORD_MAX, `Mật khẩu phòng tối đa ${ROOM_PASSWORD_MAX} ký tự.`)
      .optional(),
  )
  .optional();

export const maxPlayersSchema = z
  .number()
  .int()
  .min(MIN_PLAYERS_PER_MATCH, `Phòng có từ ${MIN_PLAYERS_PER_MATCH} người.`)
  .max(PLAYERS_PER_MATCH, `Phòng có tối đa ${PLAYERS_PER_MATCH} người.`);

export const SERIES_END_CONDITIONS = ['ROUNDS', 'TARGET_SCORE', 'MANUAL'] as const;
export type SeriesEndCondition = (typeof SERIES_END_CONDITIONS)[number];
export const SERIES_MAX_ROUNDS = 50;
export const SERIES_MAX_TARGET_SCORE = 1000;

/**
 * A multi-round match (docs/GAME_RULES.md §20): it ends after a number of rounds, when a player's
 * cumulative score reaches a target, or when the host ends it.
 */
export const seriesSettingsSchema = z
  .object({
    endCondition: z.enum(SERIES_END_CONDITIONS),
    targetRounds: z
      .number()
      .int()
      .min(1, 'Ít nhất 1 ván.')
      .max(SERIES_MAX_ROUNDS, `Tối đa ${SERIES_MAX_ROUNDS} ván.`)
      .nullish(),
    targetScore: z
      .number()
      .int()
      .min(1, 'Điểm mục tiêu phải lớn hơn 0.')
      .max(SERIES_MAX_TARGET_SCORE, `Tối đa ${SERIES_MAX_TARGET_SCORE} điểm.`)
      .nullish(),
  })
  .refine((s) => s.endCondition !== 'ROUNDS' || (s.targetRounds ?? null) !== null, {
    message: 'Chọn số ván.',
    path: ['targetRounds'],
  })
  .refine((s) => s.endCondition !== 'TARGET_SCORE' || (s.targetScore ?? null) !== null, {
    message: 'Chọn điểm mục tiêu.',
    path: ['targetScore'],
  })
  .transform((s) => ({
    endCondition: s.endCondition,
    targetRounds: s.endCondition === 'ROUNDS' ? s.targetRounds! : null,
    targetScore: s.endCondition === 'TARGET_SCORE' ? s.targetScore! : null,
  }));
export type SeriesSettingsInput = z.input<typeof seriesSettingsSchema>;
export type SeriesSettings = z.output<typeof seriesSettingsSchema>;

/**
 * Room creation input. Entry fee and turn timer must also be members of the server's allowed
 * lists (from the active rule preset); that check happens server-side. Without `rules` the room
 * plays the active preset; without `series` it plays single rounds.
 */
export const createRoomFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .max(ROOM_NAME_MAX, `Tên phòng tối đa ${ROOM_NAME_MAX} ký tự.`)
      .transform((value) => value || undefined)
      .optional(),
    visibility: roomVisibilitySchema,
    entryFee: z.number().int().nonnegative('Mức cược không hợp lệ.'),
    turnTimerSeconds: z.number().int().positive('Thời gian lượt không hợp lệ.'),
    password: optionalRoomPassword,
    maxPlayers: maxPlayersSchema.default(PLAYERS_PER_MATCH),
    allowSpectators: z.boolean().default(false),
    rules: gameRulesSchema.optional(),
    series: seriesSettingsSchema.optional(),
  })
  .refine((room) => room.visibility === 'PRIVATE' || room.password === undefined, {
    message: 'Chỉ phòng riêng tư mới có mật khẩu.',
    path: ['password'],
  });

/** Wire request: the form plus a client-generated idempotency key (duplicate submits are no-ops). */
export const createRoomRequestSchema = createRoomFormSchema.and(z.object({ requestId: z.uuid() }));
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;
/** What a client sends (defaults such as `maxPlayers` may be left out). */
export type CreateRoomInput = z.input<typeof createRoomRequestSchema>;

export const joinRoomByCodeRequestSchema = z.object({
  code: roomCodeSchema,
  password: optionalRoomPassword,
});
export type JoinRoomByCodeRequest = z.infer<typeof joinRoomByCodeRequestSchema>;

export const joinRoomRequestSchema = z.object({ password: optionalRoomPassword });
export type JoinRoomRequest = z.infer<typeof joinRoomRequestSchema>;

export const setReadyRequestSchema = z.object({ ready: z.boolean() });
export type SetReadyRequest = z.infer<typeof setReadyRequestSchema>;

/**
 * Host-only, before the start. As with creation, fee and timer must be allowed by the active
 * rule preset. The other fields are optional: omitted ones keep their value. Rules cannot change
 * once a series has played its first round.
 */
export const updateRoomSettingsRequestSchema = z.object({
  entryFee: z.number().int().nonnegative(),
  turnTimerSeconds: z.number().int().positive(),
  maxPlayers: maxPlayersSchema.optional(),
  allowSpectators: z.boolean().optional(),
  rules: gameRulesSchema.optional(),
});
export type UpdateRoomSettingsRequest = z.infer<typeof updateRoomSettingsRequestSchema>;
export type UpdateRoomSettingsInput = z.input<typeof updateRoomSettingsRequestSchema>;

/** Host-only: remove a seated player or a spectator before the match starts. */
export const removeMemberRequestSchema = z.object({ userId: z.uuid() });
export type RemoveMemberRequest = z.infer<typeof removeMemberRequestSchema>;

export const spectateRequestSchema = z.object({ password: optionalRoomPassword });
export type SpectateRequest = z.infer<typeof spectateRequestSchema>;

export const spectateByCodeRequestSchema = joinRoomByCodeRequestSchema;

/** Query string for GET /rooms (values arrive as strings). */
export const roomListQuerySchema = z.object({
  maxEntryFee: z.coerce.number().int().nonnegative().optional(),
  onlyWithSeats: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const joinMatchmakingRequestSchema = z.object({
  entryFee: z.number().int().nonnegative(),
});
export type JoinMatchmakingRequest = z.infer<typeof joinMatchmakingRequestSchema>;
