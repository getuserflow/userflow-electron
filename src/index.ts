import {remote} from 'electron'
import userflow from 'userflow.js'
import WebSocket from 'ws'

let wss: WebSocket.Server | null = null

/**
 * Starts a local WebSocket server, which Userflow's Flow Builder (running at
 * https://userflow.com) can connect to in order to preview flows in draft mode.
 */
export function startDevServer(): void {
  wss = new WebSocket.Server({host: '127.0.0.1', port: 4059})
  wss.on('connection', ws => {
    ws.on('message', data => {
      const message = JSON.parse(String(data))
      if (message.kind === 'userflow-electron:show') {
        remote.getCurrentWindow().show()
      }
    })
    userflow._setTargetEnv(new ElectronTargetEnv(ws))
  })
}

/**
 * Stops the local WebSocket server.
 */
export function stopDevServer(): void {
  if (wss) {
    wss.close()
    wss = null
  }
}

class ElectronTargetEnv {
  constructor(readonly ws: WebSocket) {
    this.ws = ws
  }

  destroy() {
    this.ws.close()
  }

  postBuilderMessage(message: Record<string, unknown>) {
    this.ws.send(JSON.stringify(message))
  }

  onBuilderMessage(onMessage: (message: Record<string, unknown>) => void) {
    const listener = (data: any) => {
      const message = JSON.parse(data)
      if (message.kind && message.kind.startsWith('userflow:')) {
        onMessage(message)
      }
    }
    this.ws.on('message', listener)
    return () => this.ws.off('message', listener)
  }

  async captureScreenshot(x: number, y: number, width: number, height: number) {
    // Capture rectangle
    const img = await remote
      .getCurrentWindow()
      .capturePage({x, y, width, height})

    // Add a white background
    return new Promise(resolve => {
      // If the display is e.g. Retina, then we'll double sizes
      const ratio = window.devicePixelRatio
      // Create canvas of desired size
      const canvas = document.createElement('canvas')
      canvas.width = width * ratio
      canvas.height = height * ratio
      const ctx = canvas.getContext('2d')!
      // Fill it with a black bg
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      // Load image
      const domImage = new Image()
      domImage.onload = () => {
        ctx.drawImage(
          // Source image (screenshot)
          domImage,
          // Source image (x, y) coordinates
          0,
          0,
          // Source image width x height
          width * ratio,
          height * ratio,
          // Destination (x, y) coordinates
          0,
          0,
          // Destination width x height
          width * ratio,
          height * ratio
        )
        // All done!
        resolve(canvas.toDataURL())
      }
      domImage.src = img.toDataURL()
    })
  }
}
