import type { FastifyInstance } from 'fastify';
import {
  authenticate,
  optionalAuthenticate,
} from '../../shared/middleware/index.js';
import {
  requireBearer,
  SWAGGER_DEMO_PASSWORD,
  tagRoutes,
  withBodyExample,
} from '../../shared/swagger/route-meta.js';
import { AuthController } from './auth.controller.js';
import {
  checkEmailAvailableBodySchema,
  checkPhoneAvailableBodySchema,
  checkUsernameQuerySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  logoutBodySchema,
  refreshBodySchema,
  registerBodySchema,
  resendOtpBodySchema,
  resetPasswordBodySchema,
  sendOtpBodySchema,
  socialLinkBodySchema,
  socialLoginBodySchema,
  socialRegisterBodySchema,
  socialUnlinkParamsSchema,
  verifyOtpBodySchema,
} from './auth.schema.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const controller = new AuthController();
  tagRoutes(app, 'Auth');

  app.post(
    '/otp/send',
    {
      schema: {
        summary: 'Send OTP',
        description:
          'Send a one-time code by email or phone. With Twilio disabled, development responses include `debugCode`.\n\n' +
          '**channel**\n' +
          '- `phone` — SMS OTP; send `countryCode` + `phoneNumber`\n' +
          '- `email` — email OTP; send `email`\n\n' +
          '**purpose**\n' +
          '- `signup` — register new account (phone/email must be free)\n' +
          '- `login` — existing account login verify\n' +
          '- `reset_password` — forgot / reset password\n' +
          '- `change_email` — edit profile: new email OTP (**Bearer required**)\n' +
          '- `change_phone` — edit profile: new phone OTP (**Bearer required**)\n\n' +
          'After `change_email` / `change_phone` verify, call `PATCH /users/me/email` or `PATCH /users/me/phone` with `verificationId`.',
        body: withBodyExample(sendOtpBodySchema, {
          channel: 'phone',
          purpose: 'signup',
          countryCode: '+91',
          phoneNumber: '9179370347',
        }),
      },
      preHandler: [optionalAuthenticate],
    },
    controller.sendOtp,
  );

  app.post(
    '/otp/resend',
    {
      schema: {
        summary: 'Resend OTP',
        description:
          'Resend OTP for the same channel/purpose/destination. Invalidates the previous pending code. ' +
          '`change_email` / `change_phone` require Bearer.',
        body: withBodyExample(resendOtpBodySchema, {
          channel: 'phone',
          purpose: 'signup',
          countryCode: '+91',
          phoneNumber: '9179370347',
        }),
      },
      preHandler: [optionalAuthenticate],
    },
    controller.resendOtp,
  );

  app.post(
    '/otp/verify',
    {
      schema: {
        summary: 'Verify OTP',
        description:
          'Verify the OTP and return a `verificationId`.\n\n' +
          '- `signup` → use with `POST /auth/register`\n' +
          '- `reset_password` → use with `POST /auth/reset-password`\n' +
          '- `change_email` / `change_phone` → **Bearer required**; then `PATCH /users/me/email` or `PATCH /users/me/phone`',
        body: withBodyExample(verifyOtpBodySchema, {
          channel: 'phone',
          purpose: 'signup',
          countryCode: '+91',
          phoneNumber: '9179370347',
          code: '123456',
        }),
      },
      preHandler: [optionalAuthenticate],
    },
    controller.verifyOtp,
  );

  app.post(
    '/register',
    {
      schema: {
        summary: 'Register account',
        description:
          'Create a user after signup OTP verification.\n\n' +
          '**Email-first (recommended)**\n' +
          '1. Send/verify email OTP → keep `verificationId`\n' +
          '2. Optional: send/verify phone OTP → pass `phoneVerificationId` + `countryCode` + `phoneNumber`\n' +
          '3. Or skip phone: omit phone fields entirely\n\n' +
          '**Phone-only:** `verificationId` from phone OTP + matching `countryCode`/`phoneNumber`.\n\n' +
          'Accepts `userName` / `isTermsAgreed` (aliases `username` / `termsAgreed`).',
        body: withBodyExample(registerBodySchema, {
          verificationId: '13f2adb1-9740-453e-8bc5-199cc40fe975',
          email: 'test@gmail.com',
          phoneVerificationId: 'a1b2c3d4-9740-453e-8bc5-199cc40fe975',
          countryCode: '+91',
          phoneNumber: '6261808707',
          password: 'Test@123#',
          fullName: 'Mikal',
          dob: '2010-01-01',
          gender: 'MALE',
          nationality: 'indian',
          userName: 'manoj.tbw',
          isTermsAgreed: true,
        }),
      },
    },
    controller.register,
  );

  app.post(
    '/login',
    {
      schema: {
        summary: 'Login',
        description:
          'Login with `{ login, password }`. `login` can be username, email, or phone number.',
        body: withBodyExample(loginBodySchema, {
          login: 'demo_user',
          password: SWAGGER_DEMO_PASSWORD,
        }),
      },
    },
    controller.login,
  );

  app.post(
    '/social/login',
    {
      schema: {
        summary: 'Social login (Google / Apple)',
        description:
          'Verify Google ID token or Apple identity token **on the server**, then:\n\n' +
          '- Existing OAuth link → `{ isNewUser: false, user, tokens }`\n' +
          '- Verified provider email matches an account → auto-link + tokens\n' +
          '- New user → `{ isNewUser: true, email, suggestedFullName, provider }` — then call `POST /auth/social/register`\n\n' +
          'Configure `GOOGLE_CLIENT_IDS` / `APPLE_CLIENT_IDS` (comma-separated audiences).',
        body: withBodyExample(socialLoginBodySchema, {
          provider: 'google',
          idToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
          fullName: 'Jane Doe',
        }),
      },
    },
    controller.socialLogin,
  );

  app.post(
    '/social/register',
    {
      schema: {
        summary: 'Social register (Google / Apple)',
        description:
          'Create a new account after `POST /auth/social/login` returned `isNewUser: true`.\n\n' +
          'Re-sends the same `idToken` (verified again server-side) plus profile fields.\n' +
          'Accepts `userName` / `isTermsAgreed` (aliases `username` / `termsAgreed`).',
        body: withBodyExample(socialRegisterBodySchema, {
          provider: 'google',
          idToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
          fullName: 'Jane Doe',
          dob: '2000-01-15',
          gender: 'FEMALE',
          nationality: 'indian',
          userName: 'jane.doe',
          isTermsAgreed: true,
        }),
      },
    },
    controller.socialRegister,
  );

  app.get(
    '/social',
    {
      schema: requireBearer({
        summary: 'List linked social providers',
        description: 'Return Google/Apple accounts linked to the current user.',
      }),
      preHandler: [authenticate],
    },
    controller.listSocialProviders,
  );

  app.post(
    '/social/link',
    {
      schema: requireBearer({
        summary: 'Link Google / Apple',
        description:
          'Link a social provider to the authenticated account. Token is verified server-side.',
        body: withBodyExample(socialLinkBodySchema, {
          provider: 'apple',
          idToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
        }),
      }),
      preHandler: [authenticate],
    },
    controller.socialLink,
  );

  app.delete(
    '/social/:provider',
    {
      schema: requireBearer({
        summary: 'Unlink Google / Apple',
        description:
          'Unlink a provider. Blocked if it would leave the account with no password and no other social login.',
        params: socialUnlinkParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.socialUnlink,
  );

  app.get(
    '/check-user-name',
    {
      schema: {
        summary: 'Check username availability',
        description:
          'Check if a username is free before registration.\n\n' +
          '- `available: true` / `isExists: false` — username can be used\n' +
          '- `available: false` / `isExists: true` — username is taken; `suggestions` has up to 3 available alternatives based on the name\n\n' +
          'Query: `username` (alias `userName`). Allowed: letters, numbers, `_`, `.` (3–50 chars).',
        querystring: checkUsernameQuerySchema,
      },
    },
    controller.checkUsername,
  );

  app.post(
    '/check-email-available',
    {
      schema: {
        summary: 'Check email availability',
        description:
          'Check if an email can be used for registration.\n\n' +
          '- `isAvailable: true` — email is free\n' +
          '- `isAvailable: false` / `isExists: true` — already registered',
        body: withBodyExample(checkEmailAvailableBodySchema, {
          email: 'test@gmail.com',
        }),
      },
    },
    controller.checkEmailAvailable,
  );

  app.post(
    '/check-phone-available',
    {
      schema: {
        summary: 'Check phone availability',
        description:
          'Check if a phone number can be used for registration.\n\n' +
          '- `isAvailable: true` — phone is free\n' +
          '- `isAvailable: false` / `isExists: true` — already registered\n\n' +
          'Body: `countryCode` (e.g. `+91`) + `phoneNumber` (digits only).',
        body: withBodyExample(checkPhoneAvailableBodySchema, {
          countryCode: '+91',
          phoneNumber: '9179370347',
        }),
      },
    },
    controller.checkPhoneAvailable,
  );

  app.post(
    '/forgot-password',
    {
      schema: {
        summary: 'Forgot password',
        description:
          'Send a reset-password OTP to an existing active account.\n\n' +
          '**Recommended (email)**\n' +
          '```json\n' +
          '{ "channel": "email", "email": "user@example.com" }\n' +
          '```\n\n' +
          '**Phone**\n' +
          '```json\n' +
          '{ "channel": "phone", "countryCode": "+91", "phoneNumber": "9179370347" }\n' +
          '```\n\n' +
          '**Login lookup** (username / email / phone — server prefers phone, else email)\n' +
          '```json\n' +
          '{ "login": "demo_user" }\n' +
          '```\n\n' +
          'Next steps: `POST /auth/otp/verify` with `purpose: "reset_password"`, then `POST /auth/reset-password` with `verificationId` + new password.',
        body: withBodyExample(forgotPasswordBodySchema, {
          channel: 'email',
          email: 'user@example.com',
        }),
      },
    },
    controller.forgotPassword,
  );

  app.post(
    '/reset-password',
    {
      schema: {
        summary: 'Reset password',
        description:
          'Set a new password after verifying a reset-password OTP. Accepts `password` or `newPassword`. Revokes all refresh tokens.',
        body: withBodyExample(resetPasswordBodySchema, {
          verificationId: '00000000-0000-4000-8000-000000000001',
          password: SWAGGER_DEMO_PASSWORD,
        }),
      },
    },
    controller.resetPassword,
  );

  app.post(
    '/refresh',
    {
      schema: {
        summary: 'Refresh tokens',
        description: 'Exchange a refresh token for a new token pair (refresh rotation).',
        body: withBodyExample(refreshBodySchema, {
          refreshToken: 'paste-refresh-token-here',
        }),
      },
    },
    controller.refresh,
  );

  app.post(
    '/logout',
    {
      schema: requireBearer({
        summary: 'Logout',
        description:
          'End the current session.\n\n' +
          '- Denylists the **access** Bearer token (API + socket reject until expiry)\n' +
          '- Revokes `refreshToken` when provided (must belong to this user)\n' +
          '- `allDevices: true` revokes **every** refresh token and clears all push/VoIP devices\n' +
          '- Sends FCM `session_revoked` ("Your device has been logged out") before deactivating push\n' +
          '- With `AUTH_MAX_ACTIVE_DEVICES=1` (default), logout clears **all** push devices; otherwise pass `deviceId` to clear that device\n' +
          '- Marks presence offline (best-effort)\n\n' +
          'Idempotent: call even if tokens were already cleared on the client.',
        body: withBodyExample(logoutBodySchema, {
          refreshToken: 'paste-refresh-token-here',
          deviceId: 'ios-device-uuid',
          allDevices: false,
        }),
      }),
      preHandler: [authenticate],
    },
    controller.logout,
  );

  app.get(
    '/me',
    {
      schema: requireBearer({
        summary: 'Current user',
        description:
          'Return the authenticated user’s full profile: account fields, user_details, and live stats (posts, reels, followers, following).',
      }),
      preHandler: [authenticate],
    },
    controller.me,
  );
}
