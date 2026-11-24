async function request(path, options) {
  let response
  try {
    response = await fetch(`/api/auth/${path}`, { credentials: 'same-origin', ...options })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('The account service is unavailable. Please try again.')
  }

  if (path === 'logout' && response.status === 204) return null

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.error || 'The account request failed. Please try again.')
    error.status = response.status
    throw error
  }
  if (!data?.user) throw new Error('The account service returned an unexpected response.')
  return data.user
}

function post(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function registerAccount(details) {
  return post('register', details)
}

export function signIn(credentials) {
  return post('login', credentials)
}

export function signOut() {
  return post('logout', {})
}

export async function getAccount(signal) {
  try {
    return await request('me', { signal })
  } catch (error) {
    if (error.status === 401) return null
    throw error
  }
}
