/**
 * Canonical consumer-facing auth validation & API error messages.
 * Keep Android / iOS / Web in sync with this copy.
 */

export const AuthMessages = {
  // ── Login ──────────────────────────────────────────────
  emailEmpty: 'Please enter your email address.',
  passwordEmpty: 'Please enter your password.',
  loginFieldsEmpty: 'Please enter your email address and password.',
  emailInvalid: 'Please enter a valid email address.',
  invalidEmailOrPassword: 'Invalid email or password.',
  accountNotFound: 'No account found with this email address.',
  emailNotVerified: 'Please verify your email address before logging in.',
  accountTemporarilyBlocked:
    'Your account has been temporarily blocked. Please try again later.',
  accountDisabled:
    'Your account has been disabled. Contact support for assistance.',
  tooManyLoginAttempts: 'Too many login attempts. Please try again later.',
  loginServerError: 'Unable to log in right now. Please try again later.',
  socialLoginOnly:
    'This account uses social login — sign in with Google or Apple.',

  // ── Sign up / email ────────────────────────────────────
  emailAlreadyRegistered:
    'An account with this email address already exists. Please log in or use a different email address.',
  phoneAlreadyRegistered:
    'An account with this phone number already exists. Please log in or use a different number.',

  // ── OTP ────────────────────────────────────────────────
  otpEmpty: 'Please enter the verification code.',
  otpIncomplete: 'Please enter the complete verification code.',
  otpIncorrect: 'The verification code you entered is incorrect.',
  otpExpired: 'This verification code has expired. Please request a new code.',
  otpResendWait:
    'Please wait before requesting another verification code.',
  otpNotFound: 'No pending verification code found. Please request a new code.',
  otpTooManyAttempts:
    'Too many attempts. Please request a new verification code.',
  otpNotVerified: 'Please enter the verification code to continue.',
  otpNotBelong: 'This verification code does not belong to your account.',
  verificationExpired:
    'This verification code has expired. Please request a new code.',

  // ── Username ───────────────────────────────────────────
  usernameEmpty: 'Please enter a username.',
  usernameTooShort: 'Username must be at least 3 characters long.',
  usernameTooLong: 'Username must not exceed 20 characters.',
  usernameInvalid:
    'Username can contain lowercase letters, numbers, underscores (_), and periods (.) only.',
  usernameTaken: 'This username is already taken. Please choose another one.',

  // ── Date of birth ──────────────────────────────────────
  dobEmpty: 'Please select your date of birth.',
  dobInvalidFormat: 'Please select a valid date of birth.',
  dobInvalid: 'Please select a valid date of birth.',
  underMinimumAge: 'You must be at least 13 years old to create an account.',

  // ── Profile media (signup) ─────────────────────────────
  profilePictureUploadFailed:
    'Unable to upload profile picture. Please try again.',
  unsupportedImageFormat: 'Please upload a JPG, JPEG, or PNG image.',
  imageSizeTooLarge: 'Image size exceeds the allowed limit.',

  // ── Password ───────────────────────────────────────────
  passwordCreateEmpty: 'Please create a password.',
  passwordNewEmpty: 'Please enter a new password.',
  passwordTooShort: 'Password must be at least 8 characters long.',
  passwordMissingUppercase:
    'Password must contain at least one uppercase letter.',
  passwordMissingLowercase:
    'Password must contain at least one lowercase letter.',
  passwordMissingNumber: 'Password must contain at least one number.',
  passwordMissingSpecial:
    'Password must contain at least one special character.',
  passwordWeak: 'Please choose a stronger password.',
  passwordRequirements: 'Password does not meet the required criteria.',
  confirmPasswordEmpty: 'Please confirm your password.',
  confirmNewPasswordEmpty: 'Please confirm your new password.',
  passwordsDoNotMatch: 'Passwords do not match.',

  // ── Terms ──────────────────────────────────────────────
  termsNotAccepted:
    'Please accept the Terms of Service and Privacy Policy to continue.',

  // ── Registration success (for clients; API may return in body) ──
  accountCreated: 'Account created successfully. Welcome to OneVibe!',
  verificationEmailSent:
    'A verification email has been sent to your email address.',

  // ── Forgot / reset password ────────────────────────────
  passwordUpdated:
    'Password updated successfully. Please log in with your new password.',
  resetNotVerified:
    'Please complete the verification code step before resetting your password.',
  cannotResetNoContact:
    'No email or phone on this account — cannot reset password via verification code.',

  // ── Shared field ───────────────────────────────────────
  countryCodeInvalid: 'Please enter a valid country code.',
  phoneDigitsOnly: 'Phone number must be digits only.',
  phoneRequired: 'Please enter your phone number.',
  countryCodeRequired: 'Please enter your country code.',
  emailRequired: 'Please enter your email address.',
  fullNameEmpty: 'Please enter your full name.',
  genderInvalid: 'Please select a valid gender (Male, Female, or Other).',
  nationalityEmpty: 'Please enter your nationality.',
  loginIdentifierEmpty: 'Please enter your email, username, or phone number.',
  provideLoginOrChannel:
    'Please enter your account email, phone, or username.',

  // ── Misc auth ──────────────────────────────────────────
  unsupportedVerificationChannel: 'Unsupported verification channel.',
  registerPhoneMismatch:
    'Verified phone does not match the registration details.',
  registerEmailMismatch:
    'Verified email does not match the registration details.',
  phoneRequiredForPhoneSignup:
    'Phone is required for phone-verified signup.',
  phoneVerificationOptionalHint:
    'Verify the phone with a verification code, or omit phone fields to skip.',
  phoneVerificationIdOnlyAfterEmail:
    'Phone verification is only used after email verification; omit it for phone-only signup.',
} as const;

export type AuthMessageKey = keyof typeof AuthMessages;
