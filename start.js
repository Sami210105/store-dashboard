import app from './server.js'

const port = Number(process.env.PORT ?? 3000)
app.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`Store Ratings | http://localhost:${port}`))
