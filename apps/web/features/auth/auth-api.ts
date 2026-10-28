import {
  authResponseSchema,
  type ForgotPasswordRequest,
  type LoginRequest,
  messageResponseSchema,
  type RegisterRequest,
  type ResetPasswordRequest,
} from '@tienlen/shared';
import { apiRequest } from '@/lib/api/client';

// Real backend calls (implemented server-side in Phase 3). No mock responses: until those
// endpoints exist, submissions surface the server's actual error.

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
