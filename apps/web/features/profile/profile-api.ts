import { currentUserSummarySchema, type UpdateProfileRequest } from '@tienlen/shared';
import { apiRequest } from '@/lib/api/client';

export function updateProfile(body: UpdateProfileRequest) {
  return apiRequest('/users/me', { method: 'PATCH', body, schema: currentUserSummarySchema });
}

export function uploadAvatar(file: File) {
  const form = new FormData();
  form.append('avatar', file);
  return apiRequest('/users/me/avatar', {
    method: 'PUT',
    body: form,
    schema: currentUserSummarySchema,
  });
}

export function removeAvatar() {
  return apiRequest('/users/me/avatar', { method: 'DELETE', schema: currentUserSummarySchema });
}
