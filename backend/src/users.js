export const USER_ROLES = Object.freeze(['CUSTOMER', 'SALES_MANAGER', 'PRODUCT_MANAGER', 'SUPPORT_AGENT']);
export const SAFE_USER_SELECT = Object.freeze({
  id: true, name: true, email: true, homeAddress: true, role: true,
});
export const PASSWORD_MAX_BYTES = 1024;

export class UserInputError extends Error {
  constructor(message = 'Invalid account information.') {
    super(message);
    this.name = 'UserInputError';
    this.code = 'INVALID_USER_INPUT';
    this.status = 400;
  }
}
export class EmailInUseError extends Error {
  constructor() {
    super('An account with this email already exists.');
    this.name = 'EmailInUseError';
    this.code = 'EMAIL_IN_USE';
    this.status = 409;
  }
}

function requireKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new UserInputError('Account fields are invalid or unsupported.');
  }
}
function requiredText(value, field, maximum) {
  if (typeof value !== 'string' || !value.isWellFormed() || !value.trim() || [...value.trim()].length > maximum ||
      value.includes(String.fromCharCode(0))) {
    throw new UserInputError(`${field} must be nonempty text of at most ${maximum} characters.`);
  }
  return value.trim();
}
export function normalizeEmail(value) {
  const raw = requiredText(value, 'email', 254);
  // This store does not support SMTPUTF8 addresses. Keep database and JavaScript
  // canonicalization identical, independently of PostgreSQL's locale.
  if (!/^[\x21-\x7e]+$/.test(raw)) throw new UserInputError('Use an ASCII email address.');
  const email = raw.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(email) || [...email].length > 254) {
    throw new UserInputError('A valid email address is required.');
  }
  return email;
}
function validateProfile(profile) {
  requireKeys(profile, ['name', 'taxId', 'email', 'homeAddress']);
  return {
    name: requiredText(profile.name, 'name', 200),
    taxId: requiredText(profile.taxId, 'taxId', 100),
    email: normalizeEmail(profile.email),
    homeAddress: requiredText(profile.homeAddress, 'homeAddress', 1000),
  };
}
export function validateNewPassword(password) {
  if (typeof password !== 'string' || !password.isWellFormed() || !password.trim() ||
      [...password].length < 12 || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    throw new UserInputError('Password must contain at least 12 characters and at most 1024 UTF-8 bytes.');
  }
  return password; // Never trim, normalize, log or persist the original password.
}
export function validateRegistrationInput(body) {
  requireKeys(body, ['name', 'taxId', 'email', 'homeAddress', 'password']);
  const { password, ...profile } = body;
  return { profile: validateProfile(profile), password: validateNewPassword(password) };
}

export function createUserRepository(prisma) {
  return {
    async createCustomer(profile, passwordHash) {
      const data = validateProfile(profile);
      requiredText(passwordHash, 'passwordHash', 512);
      try {
        return await prisma.user.create({
          data: { ...data, passwordHash, role: 'CUSTOMER' },
          select: SAFE_USER_SELECT,
        });
      } catch (error) {
        if (error.code === 'P2002') throw new EmailInUseError();
        throw error;
      }
    },
    findCredentialsByEmail(email) {
      return prisma.user.findUnique({
        where: { email: normalizeEmail(email) },
        select: { id: true, passwordHash: true },
      });
    },
    findSafeById(id) {
      if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw new UserInputError('Invalid user ID.');
      return prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT });
    },
  };
}
