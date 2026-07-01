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

## One-time setup

1. Install the CLI and log in:
   ```
   npm install -g supabase
   supabase login
   ```

2. Link this repo to your Supabase project (find the ref in your project's
   dashboard URL: `supabase.com/dashboard/project/<ref>`):
   ```
   supabase link --project-ref <your-project-ref>
   ```

3. Create a Meta Developer App at developers.facebook.com if you haven't
   already, and grab its App ID + App Secret from Settings → Basic.

4. Set the App Secret as a function secret (never put this in the frontend
   or commit it):
   ```
   supabase secrets set META_APP_ID=<your-app-id> META_APP_SECRET=<your-app-secret>
   ```

5. Push the database migration (creates `smm_social_accounts` and
   `smm_scheduled_posts`):
   ```
   supabase db push
   ```

6. Deploy the functions:
   ```
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
