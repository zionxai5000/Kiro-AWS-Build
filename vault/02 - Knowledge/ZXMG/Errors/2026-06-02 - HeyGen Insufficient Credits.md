---
tags: [zxmg, error, heygen, pipeline, blocked]
source: Seraphim
date: 2026-06-02
severity: blocking
---

# Pipeline Error: HeyGen Insufficient Credits

## What Happened
Video generation for **"How I'd Invest $1,000 in 2026"** was submitted successfully (video_id: `d21fc2df5ce5429a8c3a2007999c0cc9`) but **failed during processing** with:

```
MOVIO_PAYMENT_INSUFFICIENT_CREDIT
"Insufficient credit. This operation requires 'api' credits."
```

## Root Cause
The HeyGen account does not have enough API credits to generate this video. HeyGen charges credits based on video duration — a 10-minute, 2-scene video in 1080p requires significant credits.

## What Was Completed
| Step | Status |
|------|--------|
| ✅ Script written | `vault/02 - Knowledge/ZXMG/Scripts/2026-06-02 - How Id Invest 1000 in 2026.md` |
| ❌ HeyGen generation | Failed — insufficient credits |
| ✅ YouTube metadata | `vault/02 - Knowledge/ZXMG/Metadata/2026-06-02 - Video 001 Metadata.md` |
| ⏸️ YouTube upload | Blocked — no video file |
| ✅ Error report | This file |

## What's Needed to Proceed
1. **Add API credits** to HeyGen account at https://app.heygen.com/settings/billing
   - HeyGen pricing: ~$0.05-0.10 per minute of generated video
   - This video (~10 min) needs approximately $0.50-1.00 in credits
   - Recommended: Add $10-20 for first batch of 3 videos
2. Once credits are loaded, I can re-execute Step 2 immediately — script and metadata are already done

## Pipeline Assets Ready
- Full 10-min script (7,886 chars, 2 HeyGen scenes)
- Avatar selected: Aditya in Brown Blazer (professional, finance-appropriate)
- Voice selected: Chill Brian (clear English male)
- SEO metadata: title, 2000+ char description, 20 tags, thumbnail concept
- Everything is queued — just need credits to resume
