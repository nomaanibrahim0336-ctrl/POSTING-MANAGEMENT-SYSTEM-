// Shared Meta Graph API helpers used by the meta-oauth, social-publish and
// social-scheduler Edge Functions.

export const GRAPH_VERSION = "v19.0";
export const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

export function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export class GraphError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
  }
}

async function graphFetch(path: string, params: Record<string, string>, method = "GET") {
  const url = new URL(`${GRAPH_URL}${path}`);
  if (method === "GET") {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), {
    method,
    ...(method !== "GET"
      ? { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) }
      : {}),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new GraphError(json.error?.message || `Graph API error (${res.status})`, json.error);
  }
  return json;
}

export function exchangeForLongLivedToken(appId: string, appSecret: string, shortLivedToken: string) {
  return graphFetch("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
}

export function fetchPages(userAccessToken: string) {
  return graphFetch("/me/accounts", {
    fields: "name,access_token,instagram_business_account{id,username}",
    access_token: userAccessToken,
  });
}

// Publish to a Facebook Page feed (text, or a single photo with a caption).
export function publishToFacebook(pageId: string, pageAccessToken: string, caption: string, mediaUrl?: string) {
  if (mediaUrl) {
    return graphFetch(`/${pageId}/photos`, { url: mediaUrl, caption, access_token: pageAccessToken }, "POST");
  }
  return graphFetch(`/${pageId}/feed`, { message: caption, access_token: pageAccessToken }, "POST");
}

// Instagram Content Publishing is a two-step process: create a media
// container, then publish it. Requires a public media_url (image or video).
export async function publishToInstagram(
  igId: string,
  pageAccessToken: string,
  caption: string,
  mediaUrl: string,
  mediaType: "IMAGE" | "VIDEO" = "IMAGE",
) {
  if (!mediaUrl) throw new GraphError("Instagram posts require a public media_url");
  const containerParams: Record<string, string> = {
    caption,
    access_token: pageAccessToken,
  };
  if (mediaType === "VIDEO") {
    containerParams.media_type = "REELS";
    containerParams.video_url = mediaUrl;
  } else {
    containerParams.image_url = mediaUrl;
  }
  const container = await graphFetch(`/${igId}/media`, containerParams, "POST");
  return graphFetch(`/${igId}/media_publish`, { creation_id: container.id, access_token: pageAccessToken }, "POST");
}
