// =============================================================================
//  PNG ENCODER  —  zero external dependencies, uses Node.js built-in zlib
//  Produces valid RGBA PNG files from a raw pixel buffer.
// =============================================================================
import { deflateSync } from 'zlib'

// CRC-32 (per PNG spec: over chunk type + chunk data)
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const tb = Buffer.from(type, 'ascii')
  const lb = Buffer.allocUnsafe(4); lb.writeUInt32BE(data.length, 0)
  const cb = Buffer.allocUnsafe(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0)
  return Buffer.concat([lb, tb, data, cb])
}

/**
 * Encode a raw RGBA pixel buffer as a PNG file.
 * @param rgba  Uint8ClampedArray of length width * height * 4 (R,G,B,A interleaved)
 * @param width  Image width in pixels
 * @param height Image height in pixels
 */
export function encodePng(rgba: Uint8ClampedArray, width: number, height: number): Buffer {
  // Build raw scanlines: each row prefixed with filter byte 0 (None)
  const raw = Buffer.allocUnsafe(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4)
    raw[rowOffset] = 0 // filter type: None
    for (let x = 0; x < width * 4; x++) {
      raw[rowOffset + 1 + x] = rgba[y * width * 4 + x]
    }
  }

  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8]  = 8  // bit depth
  ihdr[9]  = 6  // color type: RGBA (truecolor + alpha)
  ihdr[10] = 0  // compression: deflate
  ihdr[11] = 0  // filter: adaptive (we use None per-row above)
  ihdr[12] = 0  // interlace: none

  // PNG magic signature
  const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
