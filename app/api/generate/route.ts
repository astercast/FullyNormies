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

export const maxDuration = 60  // Vercel: allow up to 60s for parallel AI calls

export async function POST(req: NextRequest) {
  if (!FAL_KEY) {
    return NextResponse.json(
      { error: 'FAL_KEY not configured — add it to Vercel environment variables at fal.ai/dashboard/keys' },
      { status: 500 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const { normieImageUrl, normieId, traits = [], poses = ['idle','walk','attack','crouch'], seed } = body

  if (!normieImageUrl) {
    return NextResponse.json({ error: 'normieImageUrl is required' }, { status: 400 })
  }

  // Build character description from traits
  const tv = (key: string) =>
    (traits.find((t: any) => t.key?.toLowerCase() === key.toLowerCase())?.value ?? '').toLowerCase()

  const normType  = tv('type')
  const gender    = tv('gender')
  const age       = tv('age')
  const hairStyle = tv('hair style')
  const facialFeat= tv('facial feature')
  const eyes      = tv('eyes')
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

        const res = await fetch('https://fal.run/fal-ai/flux-lora', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        if (res.ok) {
          const data = await res.json()
          const url = data.images?.[0]?.url ?? null
          if (url) return { pose, url }
        }

        // If IP-adapter caused a 422 or error, try without
        const text = await res.text().catch(() => '')
        if (!withIPAdapter) {
          throw new Error(`fal.ai error (${res.status}): ${text.slice(0, 200)}`)
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
