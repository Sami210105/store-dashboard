export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function password(value) {
  if (typeof value !== 'string' || [...value].length < 8 || [...value].length > 16 ||
      !/[A-Z]/.test(value) || !/[\p{P}\p{S}]/u.test(value)) {
    throw new HttpError(400, 'Password needs 8-16 characters, an uppercase letter and a special character.')
  }
  return value
}

export function email(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(normalized) ||
      normalized.split('@')[0].length > 64 || /(^\.|\.\.|\.@)/.test(normalized)) {
    throw new HttpError(400, 'Enter a valid email address.')
  }
  return normalized
}

export function profile(body = {}) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const address = typeof body.address === 'string' ? body.address.trim() : ''
  if ([...name].length < 20 || [...name].length > 60) {
    throw new HttpError(400, 'Name needs 20-60 characters.')
  }
  if (!address || [...address].length > 400) {
    throw new HttpError(400, 'Address needs 1-400 characters.')
  }
  return { name, email: email(body.email), address }
}

export function id(value) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 2147483647) {
    throw new HttpError(400, 'Invalid ID.')
  }
  return number
}
