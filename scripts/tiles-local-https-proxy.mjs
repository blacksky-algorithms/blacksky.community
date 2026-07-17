import {request} from 'node:http'
import {createServer as createHttpsServer} from 'node:https'
import {readFileSync} from 'node:fs'

const port = Number(process.env.TILES_HTTPS_PORT || 443)
const upstreamPort = Number(process.env.TILES_LOADING_PORT || 1503)
const keyPath = process.env.TILES_TLS_KEY || '/private/tmp/tiles.localhost-key.pem'
const certPath = process.env.TILES_TLS_CERT || '/private/tmp/tiles.localhost.pem'

const server = createHttpsServer(
  {key: readFileSync(keyPath), cert: readFileSync(certPath)},
  (req, res) => {
    const upstream = request(
      {
        hostname: '127.0.0.1',
        port: upstreamPort,
        method: req.method,
        path: req.url,
        headers: req.headers,
      },
      upstreamResponse => {
        res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers)
        upstreamResponse.pipe(res)
      },
    )
    upstream.on('error', error => {
      if (!res.headersSent) res.writeHead(502, {'content-type': 'text/plain'})
      res.end(`Tiles loading server unavailable: ${error.message}`)
    })
    req.pipe(upstream)
  },
)

server.listen(port, () => {
  console.log(`Tiles HTTPS proxy listening on https://*.tiles.localhost:${port}`)
  console.log(`Forwarding to http://127.0.0.1:${upstreamPort}`)
})
