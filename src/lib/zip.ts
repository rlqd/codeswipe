const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A minimal zip archive of text files, stored without compression. */
export function makeZip(files: { path: string; content: string }[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const entries = files.map((f) => {
    const data = enc.encode(f.content)
    return { name: enc.encode(f.path), data, crc: crc32(data) }
  })
  const now = new Date()
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

  const localSize = entries.reduce((s, e) => s + 30 + e.name.length + e.data.length, 0)
  const centralSize = entries.reduce((s, e) => s + 46 + e.name.length, 0)
  const out = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(out.buffer)
  let at = 0
  const u16 = (...values: number[]) => {
    for (const v of values) {
      view.setUint16(at, v, true)
      at += 2
    }
  }
  const u32 = (...values: number[]) => {
    for (const v of values) {
      view.setUint32(at, v, true)
      at += 4
    }
  }
  const put = (bytes: Uint8Array) => {
    out.set(bytes, at)
    at += bytes.length
  }
  // Fields shared by the local and the central header. 0x0800 marks UTF-8 names.
  const common = (e: (typeof entries)[number]) => {
    u16(20, 0x0800, 0, time, date)
    u32(e.crc, e.data.length, e.data.length)
    u16(e.name.length, 0)
  }

  const offsets = entries.map((e) => {
    const offset = at
    u32(0x04034b50)
    common(e)
    put(e.name)
    put(e.data)
    return offset
  })
  entries.forEach((e, i) => {
    u32(0x02014b50)
    u16(20)
    common(e)
    u16(0, 0, 0)
    u32(0, offsets[i])
    put(e.name)
  })
  u32(0x06054b50)
  u16(0, 0, entries.length, entries.length)
  u32(centralSize, localSize)
  u16(0)
  return out
}
