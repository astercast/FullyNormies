import { NextRequest, NextResponse } from 'next/server'

const FAL_KEY = process.env.FAL_KEY ?? ''

// PixelArtRedmond LoRA — public HuggingFace, no auth needed
const PIXEL_LORA = 'https://huggingface.co/artificialguybr/PixelArtRedmond/resolve/main/PixelArtRedmond-Lite64.safetensors'

const POSE_PROMPTS: Record<string, string> = {
  idle:   'standing idle, arms relaxed at sides, looking forward, neutral stance',
  walk:   'mid-stride walking pose, left leg forward, right arm forward, dynamic walk cycle',
  attack: 'combat attack pose, right fist punching forward, weight shifted forward, aggressive stance',
  crouch: 'crouching pose, knees deeply bent, body low, arms forward for balance',
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function callFal(payload: Record<string, unknown>) {
  const maxAttempts = 3
  let lastStatus = 0
  let lastText = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 35000)

    try {
      const res = await fetch('https://fal.run/fal-ai/flux-lora', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeout)
      if (res.ok) {
        const data = await res.json()
        const url = data.images?.[0]?.url ?? null
        if (url) return { ok: true as const, url }
        lastStatus = 502
        lastText = 'fal.ai returned success without image URL'
      } else {
        const text = await res.text().catch(() => '')
        lastStatus = res.status
        lastText = text.slice(0, 300)
        if (!RETRYABLE_STATUS.has(res.status) || attempt === maxAttempts) {
          return { ok: false as const, status: res.status, text: lastText }
        }
      }
    } catch (err: unknown) {
      clearTimeout(timeout)
      lastStatus = 599
      const msg = err instanceof Error ? err.message : 'Network error'
      const isAbort = err instanceof Error && err.name === 'AbortError'
      lastText = isAbort ? 'Request timed out' : msg
      if (attempt === maxAttempts) {
        return { ok: false as const, status: lastStatus, text: lastText }
      }
    }

    await sleep(500 * attempt)
  }

  return { ok: false as const, status: lastStatus || 500, text: lastText || 'Unknown fal.ai error' }
}

export const maxDuration = 60  // Vercel: allow up to 60s for parallel AI calls

export async function POST(req: NextRequest) {
  if (!FAL_KEY) {
    return NextResponse.json(
      { error: 'FAL_KEY not configured — add it to Vercel environment variables at fal.ai/dashboard/keys' },
      { status: 500 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const { normieImageUrl, traits = [], poses = ['idle','walk','attack','crouch'], seed } = body

  if (!normieImageUrl) {
    return NextResponse.json({ error: 'normieImageUrl is required' }, { status: 400 })
  }

  // Build character description from traits
  const tv = (key: string) =>
    (traits.find((t: { key?: string; value?: string }) => t.key?.toLowerCase() === key.toLowerCase())?.value ?? '').toLowerCase()

  const normType  = tv('type')
  const gender    = tv('gender')
  const age       = tv('age')
  const hairStyle = tv('hair style')
  const accessory = tv('accessory')

  const typeDesc =
    normType === 'agent' ? 'person wearing a sharp dark suit and tie' :
    normType === 'cat'   ? 'anthropomorphic cat-person character' :
    normType === 'alien' ? 'alien humanoid with oversized head' :
                           'person'

  const genderDesc = gender.includes('female') ? 'female' : gender.includes('non') ? 'androgynous' : 'male'
  const ageDesc    = age.includes('old') ? 'elderly ' : age.includes('young') ? 'young ' : ''
  const accDesc    = accessory && accessory !== 'no accessories' ? `, wearing ${accessory}` : ''
  const hairDesc   = hairStyle ? `, ${hairStyle}` : ''

  const characterDesc = `${ageDesc}${genderDesc} ${typeDesc}${hairDesc}${accDesc}`

  // Generate all 4 poses in parallel
  const results = await Promise.allSettled(
    (poses as string[]).map(async (pose) => {
      const poseSeed = seed != null ? seed + pose.charCodeAt(0) : undefined

      const prompt = [
        'PixelArtRedmond',
        `full body pixel art game sprite of ${characterDesc}`,
        POSE_PROMPTS[pose] ?? POSE_PROMPTS.idle,
        'two color monochrome pixel art, dark charcoal on light grey background',
        '16-bit RPG character sprite, game asset, centered in frame',
        'clean simple background, flat pixel colors, sharp pixel edges',
        'retro game sprite, 120x120 pixel art character',
      ].join(', ')

      const negPrompt = [
        'photorealistic', 'photo', '3d render', 'blurry', 'soft', 'gradient',
        'colorful', 'multiple colors', 'brown skin', 'red clothing', 'blue eyes',
        'multiple characters', 'text', 'watermark', 'border', 'frame',
        'smooth lines', 'antialiased', 'high res photography',
      ].join(', ')

      // Try with IP-adapter for face consistency first, fall back without
      for (const withIPAdapter of [true, false]) {
        const payload: Record<string, unknown> = {
          prompt,
          negative_prompt: negPrompt,
          image_size: { width: 120, height: 120 },
          num_inference_steps: 30,
          guidance_scale: 5.0,
          num_images: 1,
          output_format: 'png',
          enable_safety_checker: false,
          loras: [{ path: PIXEL_LORA, scale: 1.0 }],
          ...(poseSeed != null ? { seed: poseSeed } : {}),
        }

        if (withIPAdapter) {
          payload.ip_adapter_image_url = normieImageUrl
          payload.ip_adapter_scale = 0.55
        }

        const result = await callFal(payload)
        if (result.ok && result.url) {
          return { pose, url: result.url }
        }

        // If IP-adapter caused a 422 or error, try without
        const text = result.ok ? '' : result.text
        const status = result.ok ? 500 : result.status
        if (!withIPAdapter) {
          throw new Error(`fal.ai error (${status}): ${(text || '').slice(0, 200)}`)
        }
        // else loop again without IP adapter
      }

      throw new Error(`All attempts failed for pose: ${pose}`)
    })
  )

  const poseResults = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    console.error(`[generate] pose ${poses[i]} failed:`, r.reason?.message)
    return { pose: poses[i] as string, url: null, error: r.reason?.message }
  })

  const successCount = poseResults.filter(p => p.url).length
  if (successCount === 0) {
    return NextResponse.json(
      { error: 'All poses failed to generate', details: poseResults },
      { status: 500 }
    )
  }

  return NextResponse.json({ poses: poseResults, successCount })
}
