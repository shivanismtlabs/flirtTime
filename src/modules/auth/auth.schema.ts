import { z } from 'zod';
import {
  isValidNationalPhone,
  normalizeNationalPhone,
  phoneLengthMessage,
} from '../../shared/utils/phone.js';
import { AuthMessages } from './auth.messages.js';

const countryCodeSchema = z
  .string({
    required_error: AuthMessages.countryCodeRequired,
    invalid_type_error: AuthMessages.countryCodeRequired,
  })
  .min(1, AuthMessages.countryCodeRequired)
  .max(8, AuthMessages.countryCodeInvalid)
  .regex(/^\+?\d{1,7}$/, AuthMessages.countryCodeInvalid);

const phoneSchema = z
  .string({
    required_error: AuthMessages.phoneRequired,
    invalid_type_error: AuthMessages.phoneRequired,
  })
  .min(4, AuthMessages.phoneRequired)
  .max(20, AuthMessages.phoneRequired)
  .regex(/^\d+$/, AuthMessages.phoneDigitsOnly);

function refinePhoneForCountry(
  countryCode: string | undefined,
  phoneNumber: string | undefined,
  ctx: z.RefinementCtx,
  phonePath: (string | number)[] = ['phoneNumber'],
) {
  if (!countryCode || !phoneNumber) return;
  const normalized = normalizeNationalPhone(countryCode, phoneNumber);
  if (!isValidNationalPhone(countryCode, normalized)) {
    ctx.addIssue({
      code: 'custom',
      message: phoneLengthMessage(countryCode),
      path: phonePath,
    });
  }
}

const usernameSchema = z
  .string({
    required_error: AuthMessages.usernameEmpty,
    invalid_type_error: AuthMessages.usernameEmpty,
  })
  .trim()
  .min(1, AuthMessages.usernameEmpty)
  .superRefine((value, ctx) => {
    if (value.length < 3) {
      ctx.addIssue({
        code: 'custom',
        message: AuthMessages.usernameTooShort,
      });
      return;
    }
    if (value.length > 20) {
      ctx.addIssue({
        code: 'custom',
        message: AuthMessages.usernameTooLong,
      });
      return;
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(value)) {
      ctx.addIssue({
        code: 'custom',
        message: AuthMessages.usernameInvalid,
      });
    }
  })
  .transform((v) => v.toLowerCase());

/** Strength rules for create / reset password. */
export function refinePasswordStrength(
  value: string,
  ctx: z.RefinementCtx,
  opts?: { emptyMessage?: string; forReset?: boolean },
) {
  const emptyMsg =
    opts?.emptyMessage ??
    (opts?.forReset
      ? AuthMessages.passwordNewEmpty
      : AuthMessages.passwordCreateEmpty);

  if (!value || value.length === 0) {
    ctx.addIssue({ code: 'custom', message: emptyMsg });
    return;
  }
  if (value.length < 8) {
    ctx.addIssue({ code: 'custom', message: AuthMessages.passwordTooShort });
    return;
  }
  if (value.length > 128) {
    ctx.addIssue({
      code: 'custom',
      message: opts?.forReset
        ? AuthMessages.passwordRequirements
        : AuthMessages.passwordWeak,
    });
    return;
  }

  const issues: string[] = [];
  if (!/[A-Z]/.test(value)) issues.push(AuthMessages.passwordMissingUppercase);
  if (!/[a-z]/.test(value)) issues.push(AuthMessages.passwordMissingLowercase);
  if (!/\d/.test(value)) issues.push(AuthMessages.passwordMissingNumber);
  if (!/[^A-Za-z0-9]/.test(value)) {
    issues.push(AuthMessages.passwordMissingSpecial);
  }

  // One issue at a time keeps clients simpler; first missing rule wins.
  if (issues[0]) {
    ctx.addIssue({ code: 'custom', message: issues[0]! });
  }
}

const passwordSchema = z
  .string({
    required_error: AuthMessages.passwordCreateEmpty,
    invalid_type_error: AuthMessages.passwordCreateEmpty,
  })
  .superRefine((value, ctx) => refinePasswordStrength(value, ctx));

const resetPasswordValueSchema = z
  .string({
    required_error: AuthMessages.passwordNewEmpty,
    invalid_type_error: AuthMessages.passwordNewEmpty,
  })
  .superRefine((value, ctx) =>
    refinePasswordStrength(value, ctx, { forReset: true }),
  );

const genderSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(
    z.enum(['MALE', 'FEMALE', 'OTHER'], {
      errorMap: () => ({ message: AuthMessages.genderInvalid }),
    }),
  );

function ageFromDob(isoDate: string): number {
  const birth = new Date(`${isoDate}T00:00:00.000Z`);
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getUTCDate() < birth.getUTCDate())
  ) {
    age--;
  }
  return age;
}

const dobSchema = z
  .string({
    required_error: AuthMessages.dobEmpty,
    invalid_type_error: AuthMessages.dobEmpty,
  })
  .min(1, AuthMessages.dobEmpty)
  .regex(/^\d{4}-\d{2}-\d{2}$/, AuthMessages.dobInvalidFormat)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), {
    message: AuthMessages.dobInvalid,
  })
  .refine((value) => ageFromDob(value) >= 13, {
    message: AuthMessages.underMinimumAge,
  });

const emailSchema = z
  .string({
    required_error: AuthMessages.emailEmpty,
    invalid_type_error: AuthMessages.emailEmpty,
  })
  .trim()
  .min(1, AuthMessages.emailEmpty)
  .email(AuthMessages.emailInvalid)
  .max(255, AuthMessages.emailInvalid);

const otpCodeSchema = z
  .string({
    required_error: AuthMessages.otpEmpty,
    invalid_type_error: AuthMessages.otpEmpty,
  })
  .superRefine((value, ctx) => {
    const code = value.trim();
    if (!code) {
      ctx.addIssue({ code: 'custom', message: AuthMessages.otpEmpty });
      return;
    }
    if (!/^\d+$/.test(code)) {
      ctx.addIssue({ code: 'custom', message: AuthMessages.otpIncorrect });
      return;
    }
    if (code.length < 4 || code.length > 8) {
      ctx.addIssue({ code: 'custom', message: AuthMessages.otpIncomplete });
    }
  });

export const sendOtpBodySchema = z
  .object({
    channel: z
      .enum(['email', 'phone'])
      .describe(
        'Delivery channel for the OTP.\n' +
          '- `phone` — SMS via Twilio Verify (or local `debugCode` when Twilio is off). Requires `countryCode` + `phoneNumber`.\n' +
          '- `email` — email OTP. Requires `email`.',
      ),
    purpose: z
      .enum([
        'signup',
        'login',
        'reset_password',
        'change_email',
        'change_phone',
      ])
      .describe(
        'Why the OTP is being sent.\n' +
          '- `signup` — new account registration (destination must not already exist).\n' +
          '- `login` — login / verify existing account (destination must exist).\n' +
          '- `reset_password` — forgot / reset password flow (destination must exist).\n' +
          '- `change_email` — edit profile: OTP for a new email (Bearer required). ' +
          'Then `PATCH /users/me/email` with `verificationId`.\n' +
          '- `change_phone` — edit profile: OTP for a new phone (Bearer required). ' +
          'Then `PATCH /users/me/phone` with `verificationId`.',
      ),
    email: emailSchema.optional().describe('Required when `channel` is `email`.'),
    countryCode: countryCodeSchema
      .optional()
      .describe('Required when `channel` is `phone`. Example: `+91`.'),
    phoneNumber: phoneSchema
      .optional()
      .describe('Required when `channel` is `phone`. Digits only, without country code.'),
  })
  .superRefine((data, ctx) => {
    if (data.purpose === 'change_email' && data.channel !== 'email') {
      ctx.addIssue({
        code: 'custom',
        message: 'change_email requires channel email',
        path: ['channel'],
      });
    }
    if (data.purpose === 'change_phone' && data.channel !== 'phone') {
      ctx.addIssue({
        code: 'custom',
        message: 'change_phone requires channel phone',
        path: ['channel'],
      });
    }
    if (data.channel === 'email' && !data.email) {
      ctx.addIssue({
        code: 'custom',
        message: AuthMessages.emailEmpty,
        path: ['email'],
      });
    }
    if (data.channel === 'phone') {
      if (!data.countryCode) {
        ctx.addIssue({
          code: 'custom',
          message: AuthMessages.countryCodeRequired,
          path: ['countryCode'],
        });
      }
      if (!data.phoneNumber) {
        ctx.addIssue({
          code: 'custom',
          message: AuthMessages.phoneRequired,
          path: ['phoneNumber'],
        });
      }
      refinePhoneForCountry(data.countryCode, data.phoneNumber, ctx);
    }
  });

export const verifyOtpBodySchema = sendOtpBodySchema.and(
  z.object({
    code: otpCodeSchema,
  }),
);

/** Empty string / null → omit (skip-phone signup must not send phone fields). */
function omitBlank(
  data: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const next = { ...data };
  for (const key of keys) {
    const value = next[key];
    if (value === '' || value === null || value === undefined) {
      delete next[key];
    }
  }
  return next;
}

/** Normalize aliases before validate — Swagger only documents userName / isTermsAgreed */
function normalizeRegisterBody(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const data = raw as Record<string, unknown>;
  const { username: _username, termsAgreed: _termsAgreed, ...rest } = data;
  return omitBlank(
    {
      ...rest,
      userName: data.userName ?? data.username,
      isTermsAgreed: data.isTermsAgreed ?? data.termsAgreed,
    },
    ['phoneVerificationId', 'countryCode', 'phoneNumber'],
  );
}

const registerBodyObjectSchema = z.object({
  verificationId: z
    .string()
    .uuid()
    .describe(
      'From `/auth/otp/verify`. Prefer email signup OTP. Phone-only signup still supported.',
    ),
  email: emailSchema,
  phoneVerificationId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Optional second OTP after email verify. Pass with countryCode/phoneNumber, or omit both to skip phone.',
    ),
  countryCode: countryCodeSchema.optional(),
  phoneNumber: phoneSchema.optional(),
  password: passwordSchema,
  fullName: z
    .string({
      required_error: AuthMessages.fullNameEmpty,
      invalid_type_error: AuthMessages.fullNameEmpty,
    })
    .trim()
    .min(1, AuthMessages.fullNameEmpty)
    .min(3, AuthMessages.fullNameEmpty)
    .max(120, AuthMessages.fullNameEmpty),
  dob: dobSchema,
  gender: genderSchema,
  nationality: z
    .string({
      required_error: AuthMessages.nationalityEmpty,
      invalid_type_error: AuthMessages.nationalityEmpty,
    })
    .trim()
    .min(1, AuthMessages.nationalityEmpty)
    .max(64, AuthMessages.nationalityEmpty),
  userName: usernameSchema,
  isTermsAgreed: z.literal(true, {
    errorMap: () => ({ message: AuthMessages.termsNotAccepted }),
  }),
});

export const registerBodySchema = z.preprocess(
  normalizeRegisterBody,
  registerBodyObjectSchema
    .superRefine((data, ctx) => {
      if (data.countryCode && data.phoneNumber) {
        refinePhoneForCountry(data.countryCode, data.phoneNumber, ctx);
      }
    })
    .transform((data) => ({
      verificationId: data.verificationId,
      email: data.email,
      phoneVerificationId: data.phoneVerificationId,
      countryCode: data.countryCode,
      phoneNumber: data.phoneNumber
        ? normalizeNationalPhone(data.countryCode ?? '', data.phoneNumber)
        : data.phoneNumber,
      password: data.password,
      username: data.userName,
      fullName: data.fullName,
      dob: data.dob,
      gender: data.gender,
      nationality: data.nationality,
      termsAgreed: true as const,
    })),
);

export const loginBodySchema = z
  .object({
    /** Username, email, or phone number */
    login: z.string().optional(),
    password: z.string().optional(),
    deviceId: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .describe(
        'Stable device id — keeps this phone’s VoIP/CallKit registration after login.',
      ),
  })
  .superRefine((data, ctx) => {
    const login = String(data.login ?? '').trim();
    const password = String(data.password ?? '');
    if (!login && !password) {
      ctx.addIssue({
        code: 'custom',
        message: AuthMessages.loginFieldsEmpty,
        path: ['login'],
      });
      return;
    }
    if (!login) {
      ctx.addIssue({
        code: 'custom',
        message: AuthMessages.emailEmpty,
        path: ['login'],
      });
    } else if (login.length > 255) {
      ctx.addIssue({
        code: 'custom',
        message: AuthMessages.emailInvalid,
        path: ['login'],
      });
    } else if (login.includes('@') && !z.string().email().safeParse(login).success) {
      ctx.addIssue({
        code: 'custom',
        message: AuthMessages.emailInvalid,
        path: ['login'],
      });
    }
    if (!password) {
      ctx.addIssue({
        code: 'custom',
        message: AuthMessages.passwordEmpty,
        path: ['password'],
      });
    } else if (password.length > 128) {
      ctx.addIssue({
        code: 'custom',
        message: AuthMessages.invalidEmailOrPassword,
        path: ['password'],
      });
    }
  })
  .transform((data) => ({
    login: String(data.login ?? '').trim(),
    password: String(data.password ?? ''),
    deviceId: data.deviceId?.trim() || undefined,
  }));

export const checkEmailAvailableBodySchema = z.object({
  email: emailSchema
    .transform((v) => v.toLowerCase().trim())
    .describe('Email address to check for registration availability.'),
});

export const checkPhoneAvailableBodySchema = z
  .object({
    countryCode: countryCodeSchema.describe('Country dial code, e.g. `+91`.'),
    phoneNumber: phoneSchema.describe('Phone digits only, without country code.'),
  })
  .superRefine((data, ctx) => {
    refinePhoneForCountry(data.countryCode, data.phoneNumber, ctx);
  });

/** GET /check-user-name?username=... (also accepts userName) */
export const checkUsernameQuerySchema = z.preprocess(
  (raw) => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const data = raw as Record<string, unknown>;
    return {
      username: data.username ?? data.userName,
    };
  },
  z.object({
    username: usernameSchema.describe(
      'Username to check. Letters, numbers, underscore, and dot. Min 3, max 20.',
    ),
  }),
);

/** Resend OTP — same payload as send */
export const resendOtpBodySchema = sendOtpBodySchema;

/**
 * Forgot password — send reset OTP.
 * Provide either:
 * - `channel: "email"` + `email`, or
 * - `channel: "phone"` + `countryCode` + `phoneNumber`, or
 * - `login` (username / email / phone) — server picks phone then email.
 */
export const forgotPasswordBodySchema = z
  .object({
    login: z
      .string()
      .trim()
      .max(255)
      .optional()
      .describe(
        'Optional account lookup: username, email, or phone. ' +
          'When set, `channel` / `email` / phone fields are ignored. ' +
          'OTP is sent to the account phone if present, otherwise email.',
      ),
    channel: z
      .enum(['email', 'phone'])
      .optional()
      .describe(
        'OTP delivery channel (required when `login` is omitted).\n' +
          '- `email` — requires `email`\n' +
          '- `phone` — requires `countryCode` + `phoneNumber`',
      ),
    email: emailSchema
      .optional()
      .describe(
        'Required when `channel` is `email`. Must belong to an existing active account.',
      ),
    countryCode: countryCodeSchema
      .optional()
      .describe('Required when `channel` is `phone`. Example: `+91`.'),
    phoneNumber: phoneSchema
      .optional()
      .describe(
        'Required when `channel` is `phone`. Digits only, without country code.',
      ),
  })
  .superRefine((data, ctx) => {
    if (data.login) {
      if (data.login.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: AuthMessages.emailEmpty,
          path: ['login'],
        });
      }
      return;
    }

    if (!data.channel) {
      ctx.addIssue({
        code: 'custom',
        message: AuthMessages.provideLoginOrChannel,
        path: ['channel'],
      });
      return;
    }
    if (data.channel === 'email' && !data.email) {
      ctx.addIssue({
        code: 'custom',
        message: AuthMessages.emailEmpty,
        path: ['email'],
      });
    }
    if (data.channel === 'phone') {
      if (!data.countryCode) {
        ctx.addIssue({
          code: 'custom',
          message: AuthMessages.countryCodeRequired,
          path: ['countryCode'],
        });
      }
      if (!data.phoneNumber) {
        ctx.addIssue({
          code: 'custom',
          message: AuthMessages.phoneRequired,
          path: ['phoneNumber'],
        });
      }
    }
  });

export const resetPasswordBodySchema = z
  .object({
    verificationId: z.string().uuid(),
    password: resetPasswordValueSchema.optional(),
    newPassword: resetPasswordValueSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.password && !data.newPassword) {
      ctx.addIssue({
        code: 'custom',
        message: AuthMessages.passwordNewEmpty,
        path: ['password'],
      });
    }
  })
  .transform((data) => ({
    verificationId: data.verificationId,
    password: (data.password ?? data.newPassword)!,
  }));

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

/** POST /auth/logout — requires Bearer access token. */
export const logoutBodySchema = z.object({
  refreshToken: z
    .string()
    .min(1)
    .optional()
    .describe('Session refresh token to revoke (recommended).'),
  deviceId: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional()
    .describe(
      'Client deviceId (optional). On logout, push devices are deactivated so calls stop.',
    ),
  allDevices: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'When true, revoke every refresh token. Push devices are deactivated on logout.',
    ),
});

const socialProviderSchema = z.enum(['google', 'apple']);

export const socialLoginBodySchema = z.object({
  provider: socialProviderSchema.describe('`google` or `apple`'),
  idToken: z
    .string()
    .min(20)
    .describe('Google ID token or Apple identity token (verified server-side).'),
  fullName: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .describe('Optional display name (Apple sends this only on first authorize).'),
  deviceId: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional()
    .describe(
      'Stable device id — keeps this phone’s VoIP/CallKit registration after login.',
    ),
});

export const socialRegisterBodySchema = z.preprocess(
  (raw) => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const data = raw as Record<string, unknown>;
    return {
      ...data,
      userName: data.userName ?? data.username,
      isTermsAgreed: data.isTermsAgreed ?? data.termsAgreed,
    };
  },
  z
    .object({
      provider: socialProviderSchema,
      idToken: z.string().min(20),
      fullName: z
        .string({
          required_error: AuthMessages.fullNameEmpty,
          invalid_type_error: AuthMessages.fullNameEmpty,
        })
        .trim()
        .min(1, AuthMessages.fullNameEmpty)
        .min(3, AuthMessages.fullNameEmpty)
        .max(120),
      dob: dobSchema,
      gender: genderSchema,
      nationality: z
        .string()
        .trim()
        .min(1, AuthMessages.nationalityEmpty)
        .max(64),
      userName: usernameSchema,
      isTermsAgreed: z.literal(true, {
        errorMap: () => ({ message: AuthMessages.termsNotAccepted }),
      }),
    })
    .transform((data) => ({
      provider: data.provider,
      idToken: data.idToken,
      username: data.userName,
      fullName: data.fullName,
      dob: data.dob,
      gender: data.gender,
      nationality: data.nationality,
      termsAgreed: true as const,
    })),
);

export const socialLinkBodySchema = z.object({
  provider: socialProviderSchema,
  idToken: z.string().min(20),
});

export const socialUnlinkParamsSchema = z.object({
  provider: socialProviderSchema,
});

/** Re-export helpers / schemas used by user profile update */
export {
  usernameSchema as authUsernameSchema,
  passwordSchema as authPasswordSchema,
  dobSchema as authDobSchema,
  emailSchema as authEmailSchema,
  ageFromDob,
};
