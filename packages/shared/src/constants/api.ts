/** Version prefix for every REST route (no leading slash, as NestJS expects). */
export const API_PREFIX = 'api/v1';

/** Header used to propagate request correlation IDs between web, server, and logs. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** HttpOnly session cookie set by the API. The web server forwards it when it calls the API. */
export const SESSION_COOKIE_NAME = 'tl_session';
