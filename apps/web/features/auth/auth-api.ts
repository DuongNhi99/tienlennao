import {
  authResponseSchema,
  type ForgotPasswordRequest,
  type LoginRequest,
  messageResponseSchema,
  type RegisterRequest,
  type ResetPasswordRequest,
  type VerifyEmailRequest,
  emailAvailabilityResponseSchema,
} from '@tienlen/shared';
import { apiRequest, noContentSchema } from '@/lib/api/client';

// Real backend calls only; there are no mock responses for authentication, even in UI preview.

export function checkEmailAvailable(email: string) {
  return apiRequest('/auth/email-availability', {
    method: 'POST',
    body: { email },
    schema: emailAvailabilityResponseSchema,
  });
}

export function register(body: RegisterRequest) {
  return apiRequest('/auth/register', { method: 'POST', body, schema: authResponseSchema });
}

export function login(body: LoginRequest) {
  return apiRequest('/auth/login', { method: 'POST', body, schema: authResponseSchema });
}

export function requestPasswordReset(body: ForgotPasswordRequest) {
  return apiRequest('/auth/forgot-password', {
    method: 'POST',
    body,
    schema: messageResponseSchema,
  });
}

export function resetPassword(body: ResetPasswordRequest) {
  return apiRequest('/auth/reset-password', {
    method: 'POST',
    body,
    schema: messageResponseSchema,
  });
}

export function verifyEmail(body: VerifyEmailRequest) {
  return apiRequest('/auth/verify-email', {
    method: 'POST',
    body,
    schema: messageResponseSchema,
  });
}

export function resendVerification() {
  return apiRequest('/auth/resend-verification', {
    method: 'POST',
    schema: messageResponseSchema,
  });
}

export function logout() {
  return apiRequest('/auth/logout', { method: 'POST', schema: noContentSchema });
}

/** Signs out every device, including this one. */
export function logoutEverywhere() {
  return apiRequest('/auth/logout-all', { method: 'POST', schema: noContentSchema });
}
