import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: '#A67C8E',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FAF5F0',
          fontSize: 18,
          fontWeight: 600,
          fontFamily: 'serif',
        }}
      >
        מ
      </div>
    ),
    { ...size },
  )
}
