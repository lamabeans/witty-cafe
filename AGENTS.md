# Witty.Cafe Agent Notes

## Project Location

- The real app repo is `/Users/macofchris/Documents/witty cafe/my-app`.
- The GitHub remote is `https://github.com/lamabeans/witty-cafe`.
- The production Vercel project is `witty-cafe-vgbe`.
- The live production URL is `https://witty-cafe-vgbe.vercel.app/`.
- Convex deployment: `https://avid-walrus-331.convex.cloud`.

## Standard Release Workflow

1. Make changes in the local repo.
2. Run local checks before publishing:
   - `npx convex codegen` after Convex schema/function changes.
   - `npm run lint`.
   - `npx tsc --noEmit`.
   - `npm run build`.
3. If Convex functions/schema/auth config changed, sync Convex:
   - `npx convex dev --once`.
4. Commit the change to Git.
5. Push to GitHub `main`:
   - `git push origin main`.
6. Vercel should automatically build from GitHub `main`.
7. Verify the Vercel deployment is `READY` for project `witty-cafe-vgbe`.
8. Test the live site at `https://witty-cafe-vgbe.vercel.app/`.

## Live Site Smoke Test

After Vercel deploys, check:

- Home page loads and hydrates from Convex.
- Public taxonomy uses Flavours/Flavors, Collections, Vibes, and Audiences.
- Collections appear.
- Posts appear.
- A post detail page loads.
- Feed media strip and post detail media viewer render when media exists.
- Legacy Bubble formatting such as `[b]...[/b]` is not visible to users.
- Signed-out users can browse but cannot post, react, upload, or comment.
- Signed-in users can post, upload media, react, choose feed media layout, and comment.
- Console has no obvious runtime errors.

## Auth And Convex Notes

- Clerk must be connected to Convex through `ConvexProviderWithClerk`.
- Convex auth config lives in `convex/auth.config.ts`.
- Convex needs `CLERK_JWT_ISSUER_DOMAIN` set to the Clerk issuer domain.
- Current Clerk issuer domain: `https://funny-beagle-17.clerk.accounts.dev`.
- Do not assume Clerk login is enough; UI write actions should use `useConvexAuth()` so mutations only enable when Convex auth is ready.

## Deployment Expectation

The expected flow is:

`local repo change -> commit -> push to GitHub main -> Vercel automatic production deployment -> live site verification`.

If the live site does not match the pushed code, inspect the latest Vercel deployment for `witty-cafe-vgbe` and compare its Git commit SHA with local `git rev-parse HEAD`.

## Redesign Taxonomy Notes

- Public language:
  - Flavours/Flavors: broad discovery categories that can include type, topic, theme, occasion, or format.
  - Collections: the old community/subreddit concept, still stored internally in `subreddits`.
  - Vibes: tone, style, intent, or purpose, still stored internally in `tags`.
  - Audiences: who the wording is for or about.
- Run `npm run migrate:redesign:dry-run` before applying taxonomy/reaction migrations.
- Run `npm run migrate:redesign` only when ready to write Convex data.
- The dry-run currently surfaces uncertain Collection-to-Flavour mappings for review.

## AI Media Generation Notes

- AI media generation runs only from Convex actions; never expose provider keys to the browser.
- Default provider is OpenAI. Kimi and Anthropic are prompt-assist providers for now: they refine the media prompt, then OpenAI renders the image/audio/video.
- Provider key Convex env vars:
  - OpenAI: `OPENAI_API_KEY`.
  - Gemini: `GEMINI_API_KEY`.
  - ElevenLabs audio: `ELEVENLABS_API_KEY`, optional `ELEVENLABS_VOICE_ID`.
  - Kimi prompt assist: `MOONSHOT_API_KEY` plus `OPENAI_API_KEY`, optional `MOONSHOT_BASE_URL`.
  - Anthropic prompt assist: `ANTHROPIC_API_KEY` plus `OPENAI_API_KEY`.
- Optional Convex env vars:
  - `AI_GENERATION_ADMIN_EMAILS`: comma-separated admin emails that can generate for legacy/imported posts.
  - `AI_GENERATION_DAILY_LIMIT`: defaults to `5`.
  - `AI_IMAGE_MODEL`, `AI_AUDIO_MODEL`, `AI_AUDIO_VOICE`, `AI_VIDEO_MODEL`, `AI_VIDEO_SIZE`, `AI_VIDEO_SECONDS`.
  - `AI_GEMINI_IMAGE_MODEL`, `AI_GEMINI_AUDIO_MODEL`, `AI_GEMINI_VIDEO_MODEL`, `AI_GEMINI_VOICE`, `AI_GEMINI_IMAGE_SIZE`, `AI_GEMINI_VIDEO_ASPECT_RATIO`, `AI_GEMINI_VIDEO_RESOLUTION`.
  - `AI_ELEVENLABS_MODEL`.
  - `AI_KIMI_MODEL`.
  - `AI_ANTHROPIC_MODEL`.
- Default OpenAI models are `gpt-image-2`, `gpt-4o-mini-tts`, and `sora-2`.
- Default Gemini models are `gemini-3.1-flash-image-preview`, `gemini-3.1-flash-tts-preview`, and `veo-3.1-generate-preview`.
- Default Kimi prompt model is `kimi-k2.6`; default Anthropic prompt model is `claude-sonnet-4-20250514`; default ElevenLabs TTS model is `eleven_multilingual_v2`.
- Generated media is stored in Convex Storage and attached as `mediaItems.source = "ai-generated"`.

## AI Content Generation Notes

- AI text/content generation runs only from Convex actions; never expose provider keys to the browser.
- Admins are controlled by the comma-separated Convex env var `AI_GENERATION_ADMIN_EMAILS`.
- The dashboard AI Content Studio can generate a new Collection or add ideas to an existing Collection.
- Campaigns are stored in `aiContentCampaigns`, then publish generated `collections`, `posts`, and `postTags`.
- Provider key Convex env vars:
  - Kimi/Moonshot: `MOONSHOT_API_KEY`, optional `MOONSHOT_BASE_URL`, optional `AI_KIMI_TEXT_MODEL` defaulting to `kimi-k2.6`.
  - Z.ai: `ZAI_API_KEY`, optional `ZAI_BASE_URL`, optional `AI_ZAI_TEXT_MODEL` defaulting to `glm-5.1`.
- Background cron:
  - Vercel calls `/api/cron/ai-content` from `vercel.json`.
  - Set the same secret in Vercel and Convex as `AI_CONTENT_CRON_SECRET` or `CRON_SECRET`.
  - The route uses `NEXT_PUBLIC_CONVEX_URL` to schedule queued Convex campaigns.
