// Cron entry point: finds scheduled posts that are due and publishes them.
// Not called by the frontend directly — invoked on a timer (see
// supabase/functions/README.md for how to schedule it).
//
// Deploy: supabase functions deploy social-scheduler --no-verify-jwt

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, publishToFacebook, publishToInstagram } from "../_shared/graph.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: due, error } = await supabase
    .from("smm_scheduled_posts")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .limit(20);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const results = [];
  for (const post of due ?? []) {
    await supabase.from("smm_scheduled_posts").update({ status: "publishing" }).eq("id", post.id);

    try {
      const { data: account, error: acctError } = await supabase
        .from("smm_social_accounts")
        .select("page_id, page_access_token, ig_id")
        .eq("page_id", post.page_id)
        .single();
      if (acctError || !account) throw new Error("Connected account not found");

      const update: Record<string, unknown> = { status: "posted", posted_at: new Date().toISOString(), error: null };

      if (post.target === "facebook" || post.target === "both") {
        const fb = await publishToFacebook(account.page_id, account.page_access_token, post.caption, post.media_url);
        update.facebook_post_id = fb.post_id || fb.id;
      }
      if (post.target === "instagram" || post.target === "both") {
        if (!account.ig_id) throw new Error("This Page has no linked Instagram Business account");
        const ig = await publishToInstagram(account.ig_id, account.page_access_token, post.caption, post.media_url, post.media_type);
        update.instagram_post_id = ig.id;
      }

      await supabase.from("smm_scheduled_posts").update(update).eq("id", post.id);
      results.push({ id: post.id, ok: true });
    } catch (err) {
      await supabase
        .from("smm_scheduled_posts")
        .update({ status: "failed", error: err instanceof Error ? err.message : String(err) })
        .eq("id", post.id);
      results.push({ id: post.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
});
