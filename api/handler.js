import app from '../server.js'

export default function handler(req, res) {
  const requestUrl = new URL(req.url, 'http://localhost')
  if (requestUrl.pathname === '/api/handler' || requestUrl.pathname === '/api/handler.js') {
    const route = requestUrl.searchParams.get('__route') ?? ''
    if (!/^[a-z0-9/-]+$/.test(route)) {
      res.statusCode = 404
      return res.end()
    }
    requestUrl.pathname = '/api/' + route
    requestUrl.searchParams.delete('__route')
    req.url = requestUrl.pathname + requestUrl.search
  }
  return app(req, res)
}
