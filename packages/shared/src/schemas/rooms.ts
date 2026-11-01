import { z } from 'zod';

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

/**
 * Room creation input. Entry fee and turn timer must also be members of the server's allowed
 * lists (from the active rule preset); that check happens server-side.
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
  })
  .refine((room) => room.visibility === 'PRIVATE' || room.password === undefined, {
    message: 'Chỉ phòng riêng tư mới có mật khẩu.',
    path: ['password'],
  });

/** Wire request: the form plus a client-generated idempotency key (duplicate submits are no-ops). */
export const createRoomRequestSchema = createRoomFormSchema.and(z.object({ requestId: z.uuid() }));
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;

export const joinRoomByCodeRequestSchema = z.object({
  code: roomCodeSchema,
  password: optionalRoomPassword,
});
export type JoinRoomByCodeRequest = z.infer<typeof joinRoomByCodeRequestSchema>;

export const joinRoomRequestSchema = z.object({ password: optionalRoomPassword });
export type JoinRoomRequest = z.infer<typeof joinRoomRequestSchema>;

export const setReadyRequestSchema = z.object({ ready: z.boolean() });
export type SetReadyRequest = z.infer<typeof setReadyRequestSchema>;

/** Host-only. As with creation, the values must be allowed by the active rule preset. */
export const updateRoomSettingsRequestSchema = z.object({
  entryFee: z.number().int().nonnegative(),
  turnTimerSeconds: z.number().int().positive(),
});
export type UpdateRoomSettingsRequest = z.infer<typeof updateRoomSettingsRequestSchema>;

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
