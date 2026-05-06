function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export const whoopOAuth = {
  authorizeUrl: "https://api.prod.whoop.com/oauth/oauth2/auth",
  tokenUrl: "https://api.prod.whoop.com/oauth/oauth2/token",
  scopes: [
    "read:recovery",
    "read:cycles",
    "read:sleep",
    "read:profile",
    "offline",
  ].join(" "),
  redirectUri: () => `${appUrl()}/api/connections/whoop/callback`,
  clientId: () => process.env.WHOOP_CLIENT_ID ?? "",
  clientSecret: () => process.env.WHOOP_CLIENT_SECRET ?? "",
};

export const ouraOAuth = {
  authorizeUrl: "https://cloud.ouraring.com/oauth/authorize",
  tokenUrl: "https://api.ouraring.com/oauth/token",
  scopes: ["personal", "daily", "session", "heartrate"].join(" "),
  redirectUri: () => `${appUrl()}/api/connections/oura/callback`,
  clientId: () => process.env.OURA_CLIENT_ID ?? "",
  clientSecret: () => process.env.OURA_CLIENT_SECRET ?? "",
};
