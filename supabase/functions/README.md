# Facebook / Instagram backend (Supabase Edge Functions)

Three functions:

- **meta-oauth** — called once when you click "Connect Facebook & Instagram"
  in Settings. Exchanges the short-lived browser token for a long-lived one,
  fetches your Pages + linked Instagram accounts, and stores their Page
  access tokens server-side.
- **social-publish** — publishes a post immediately. Called from the
  frontend with just a `pageId`; the access token never leaves the server.
- **social-scheduler** — cron-triggered. Publishes anything in
  `smm_scheduled_posts` whose `scheduled_for` time has passed.

## One-time setup — GitHub Actions (this repo's setup)

`.github/workflows/deploy-supabase.yml` deploys the database migration and
all three functions automatically on every push to `main` that touches
`supabase/**` (or via manual "Run workflow").

1. Create a Meta Developer App at developers.facebook.com if you haven't
   already, and grab its App ID + App Secret from Settings → Basic.

2. Set the App Secret as a **Supabase function secret** (this is separate
   from GitHub secrets below — it's how the deployed functions read it at
   runtime; never put this in the frontend or commit it):
   ```
   supabase secrets set META_APP_ID=<your-app-id> META_APP_SECRET=<your-app-secret>
   ```
   (Needs the CLI once, or set it from the Supabase dashboard under
   Edge Functions → Secrets.)

3. Add these as **GitHub repo secrets** (Settings → Secrets and variables →
   Actions) so the workflow can deploy:
   - `SUPABASE_ACCESS_TOKEN` — generate at supabase.com/dashboard/account/tokens
   - `SUPABASE_PROJECT_REF` — from your project dashboard URL
     (`supabase.com/dashboard/project/<ref>`)
   - `SUPABASE_DB_PASSWORD` — your project's database password (Settings →
     Database), needed for `supabase db push`

4. Push to `main` (or run the workflow manually from the Actions tab) —
   it links the project, pushes the migration, and deploys all three
   functions.

## Manual setup (alternative to GitHub Actions)

```
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set META_APP_ID=<your-app-id> META_APP_SECRET=<your-app-secret>
supabase db push
supabase functions deploy meta-oauth --no-verify-jwt
supabase functions deploy social-publish --no-verify-jwt
supabase functions deploy social-scheduler --no-verify-jwt
```

## Scheduling social-scheduler to run on a timer

Supabase projects can run `pg_cron` + `pg_net` to hit an Edge Function URL
on a schedule. In the SQL Editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'social-scheduler-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<your-project-ref>.supabase.co/functions/v1/social-scheduler',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <your-service-role-key>',
      'Content-Type', 'application/json'
    )
  );
  $$
);
```

(Alternatively, Supabase's dashboard has a "Cron Jobs" panel under
Edge Functions that does the same thing without writing SQL.)

## Notes / limits

- Instagram posting requires the target Page to have a linked Instagram
  **Business or Creator** account — the connect flow will show a warning
  next to any Page without one.
- Instagram posts require a publicly reachable `media_url` (image or video)
  — the Graph API cannot accept an uploaded file directly.
- Page access tokens obtained this way are long-lived (~60 days) but not
  permanent; re-connecting periodically refreshes them.
- Your Facebook App needs Meta App Review to request `pages_manage_posts`
  and `instagram_content_publish` for real (non-admin/tester) accounts —
  until then, only accounts added as Admins/Testers on the app can connect.
