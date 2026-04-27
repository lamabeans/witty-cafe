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
- Communities appear.
- Posts appear.
- A post detail page loads.
- Legacy Bubble formatting such as `[b]...[/b]` is not visible to users.
- Signed-out users can browse but cannot post, vote, or comment.
- Signed-in users can post, vote, and comment.
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
