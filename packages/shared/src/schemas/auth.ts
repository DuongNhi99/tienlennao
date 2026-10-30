import { z } from 'zod';

/**
 * Account input validation shared by the web forms and the auth API (Phase 3).
 * Request schemas are what the server accepts; form schemas add client-only fields.
 */

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const EMAIL_MAX = 254;

/** Trimmed and lower-cased: the server stores normalized emails so uniqueness is reliable. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Vui lòng nhập email.')
  .max(EMAIL_MAX, 'Email quá dài.')
  .pipe(z.email('Email không hợp lệ.'));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Mật khẩu phải có ít nhất ${PASSWORD_MIN} ký tự.`)
  .max(PASSWORD_MAX, `Mật khẩu tối đa ${PASSWORD_MAX} ký tự.`)
  .regex(/\p{L}/u, 'Mật khẩu phải chứa ít nhất một chữ cái.')
  .regex(/\d/, 'Mật khẩu phải chứa ít nhất một chữ số.');

/** NFC-normalized, trimmed, inner whitespace collapsed; letters (incl. Vietnamese), digits, space, _ . - */
export const displayNameSchema = z
  .string()
  .transform((value) => value.normalize('NFC').trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(DISPLAY_NAME_MIN, `Tên hiển thị phải có ít nhất ${DISPLAY_NAME_MIN} ký tự.`)
      .max(DISPLAY_NAME_MAX, `Tên hiển thị tối đa ${DISPLAY_NAME_MAX} ký tự.`)
      .regex(
        /^[\p{L}\p{M}\p{N} _.-]+$/u,
        'Tên hiển thị chỉ gồm chữ cái, chữ số, khoảng trắng và các ký tự _ . -',
      ),
  );

export const registerRequestSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, {
    error: 'Bạn cần đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư.',
  }),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

const confirmPasswordSchema = z.string().min(1, 'Vui lòng nhập lại mật khẩu.');

/**
 * Both passwords must match. By default Zod skips object refinements while any field is
 * invalid, which hid a mismatch until e.g. the terms box was ticked; `when` runs the check as
 * soon as both password fields have been filled in.
 */
function passwordsMatch(data: { password: string; confirmPassword: string }) {
  return data.password === data.confirmPassword;
}
const passwordsMatchParams = {
  message: 'Mật khẩu xác nhận không khớp.',
  path: ['confirmPassword'],
  when: ({ value }: { value: unknown }) => {
    const { password, confirmPassword } = (value ?? {}) as Record<string, unknown>;
    return typeof password === 'string' && typeof confirmPassword === 'string' && !!confirmPassword;
  },
};

export const registerFormSchema = registerRequestSchema
  .extend({ confirmPassword: confirmPasswordSchema })
  .refine(passwordsMatch, passwordsMatchParams);

/** Login never applies the password policy (older passwords may predate it). */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Vui lòng nhập mật khẩu.').max(PASSWORD_MAX),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(16, 'Liên kết đặt lại mật khẩu không hợp lệ.').max(256),
  password: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const resetPasswordFormSchema = resetPasswordRequestSchema
  .extend({ confirmPassword: confirmPasswordSchema })
  .refine(passwordsMatch, passwordsMatchParams);

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(16, 'Liên kết xác minh không hợp lệ.').max(256),
});
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

/** PATCH /users/me. Only the display name is editable here; avatars use their own endpoint. */
export const updateProfileRequestSchema = z.object({ displayName: displayNameSchema });
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
