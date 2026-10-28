import { describe, expect, it } from 'vitest';
import {
  displayNameSchema,
  emailSchema,
  loginRequestSchema,
  passwordSchema,
  registerFormSchema,
} from './auth';

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message;
}

describe('emailSchema', () => {
  it('normalizes case and whitespace', () => {
    expect(emailSchema.parse('  Player@Example.COM ')).toBe('player@example.com');
  });

  it('reports a Vietnamese message for empty and malformed input', () => {
    expect(firstMessage(emailSchema.safeParse(''))).toBe('Vui lòng nhập email.');
    expect(firstMessage(emailSchema.safeParse('not-an-email'))).toBe('Email không hợp lệ.');
  });
});

describe('passwordSchema', () => {
  it('requires 8+ characters with a letter and a digit', () => {
    expect(passwordSchema.safeParse('abc12345').success).toBe(true);
    expect(passwordSchema.safeParse('mậtkhẩu9').success).toBe(true);
    expect(firstMessage(passwordSchema.safeParse('abc123'))).toMatch(/ít nhất 8 ký tự/);
    expect(firstMessage(passwordSchema.safeParse('abcdefgh'))).toMatch(/chữ số/);
    expect(firstMessage(passwordSchema.safeParse('12345678'))).toMatch(/chữ cái/);
  });
});

describe('displayNameSchema', () => {
  it('accepts Vietnamese names and collapses whitespace', () => {
    expect(displayNameSchema.parse('  Nguyễn   Văn  An ')).toBe('Nguyễn Văn An');
  });

  it('normalizes decomposed (NFD) input to NFC', () => {
    const decomposed = 'Tiến'.normalize('NFD');
    expect(displayNameSchema.parse(decomposed)).toBe('Tiến'.normalize('NFC'));
  });

  it('rejects names that are too short, too long, or contain markup', () => {
    expect(displayNameSchema.safeParse('ab').success).toBe(false);
    expect(displayNameSchema.safeParse('a'.repeat(21)).success).toBe(false);
    expect(displayNameSchema.safeParse('<script>').success).toBe(false);
  });
});

describe('registerFormSchema', () => {
  const valid = {
    displayName: 'Người chơi 1',
    email: 'p1@example.com',
    password: 'matkhau123',
    confirmPassword: 'matkhau123',
    acceptTerms: true,
  };

  it('accepts a valid registration', () => {
    expect(registerFormSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects mismatched passwords on the confirmPassword field', () => {
    const result = registerFormSchema.safeParse({ ...valid, confirmPassword: 'khac12345' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword']);
  });

  it('reports a mismatch even while another field is still invalid', () => {
    const result = registerFormSchema.safeParse({
      ...valid,
      confirmPassword: 'khac12345',
      acceptTerms: false,
    });
    const messages = result.error?.issues.map((issue) => issue.message);
    expect(messages).toContain('Mật khẩu xác nhận không khớp.');
    expect(messages).toEqual(expect.arrayContaining([expect.stringMatching(/Điều khoản/)]));
  });

  it('does not report a mismatch before the confirmation is entered', () => {
    const result = registerFormSchema.safeParse({ ...valid, confirmPassword: '' });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Vui lòng nhập lại mật khẩu.',
    ]);
  });

  it('requires accepting the terms', () => {
    const result = registerFormSchema.safeParse({ ...valid, acceptTerms: false });
    expect(result.error?.issues[0]?.message).toMatch(/Điều khoản/);
  });
});

describe('loginRequestSchema', () => {
  it('does not apply the password policy at login', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});
