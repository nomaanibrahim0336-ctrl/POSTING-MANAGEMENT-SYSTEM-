// Exchanges the short-lived Facebook user access token (obtained client-side
// via Facebook Login) for a long-lived one, fetches the user's Pages and any
// linked Instagram Business accounts, and stores their (long-lived) Page
// access tokens server-side. The App Secret and stored tokens never reach
// the browser.
//
// Deploy: supabase functions deploy meta-oauth
// Secrets required: META_APP_ID, META_APP_SECRET
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, exchangeForLongLivedToken, fetchPages } from "../_shared/graph.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  try {
    const { userAccessToken, connectedBy } = await req.json();
    if (!userAccessToken) throw new Error("Missing userAccessToken");

    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appId || !appSecret) throw new Error("Server is missing META_APP_ID / META_APP_SECRET");

    const longLived = await exchangeForLongLivedToken(appId, appSecret, userAccessToken);
    const pagesRes = await fetchPages(longLived.access_token);
    const pages = pagesRes.data || [];

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const rows = pages.map((p: any) => ({
      page_id: p.id,
      page_name: p.name,
      page_access_token: p.access_token, // long-lived because the user token used to fetch it is long-lived
      ig_id: p.instagram_business_account?.id ?? null,
      ig_username: p.instagram_business_account?.username ?? null,
      connected_by: connectedBy ?? null,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length) {
      const { error } = await supabase.from("smm_social_accounts").upsert(rows, { onConflict: "page_id" });
      if (error) throw new Error(error.message);
    }

    const { data: accounts, error: readError } = await supabase
      .from("smm_social_accounts_public")
      .select("*")
      .in("page_id", rows.map((r) => r.page_id));
    if (readError) throw new Error(readError.message);

    return new Response(JSON.stringify({ accounts: accounts ?? [] }), {
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
});
