// Publishes a post immediately to a connected Facebook Page and/or its
// linked Instagram Business account. Looks up the stored (long-lived) Page
// access token server-side — the frontend only ever sends a page_id.
//
// Deploy: supabase functions deploy social-publish
// Request body: { pageId, target: 'facebook'|'instagram'|'both', caption, mediaUrl?, mediaType? }

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, publishToFacebook, publishToInstagram } from "../_shared/graph.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  try {
    const { pageId, target, caption, mediaUrl, mediaType } = await req.json();
    if (!pageId) throw new Error("Missing pageId");
    if (!["facebook", "instagram", "both"].includes(target)) throw new Error("target must be facebook, instagram or both");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: account, error } = await supabase
      .from("smm_social_accounts")
      .select("page_id, page_access_token, ig_id")
      .eq("page_id", pageId)
      .single();
    if (error || !account) throw new Error("No connected account found for this pageId");

    const result: Record<string, unknown> = {};

    if (target === "facebook" || target === "both") {
      const fb = await publishToFacebook(account.page_id, account.page_access_token, caption, mediaUrl);
      result.facebookPostId = fb.post_id || fb.id;
    }

    if (target === "instagram" || target === "both") {
      if (!account.ig_id) throw new Error("This Page has no linked Instagram Business account");
      const ig = await publishToInstagram(account.ig_id, account.page_access_token, caption, mediaUrl, mediaType || "IMAGE");
      result.instagramPostId = ig.id;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
});
