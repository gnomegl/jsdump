package main

import "regexp"

type patternDef struct {
	name, category string
	re             *regexp.Regexp
}

var (
	reFullURL            = regexp.MustCompile(`https?://[a-zA-Z0-9][a-zA-Z0-9._-]*\.[a-zA-Z]{2,}(?:[/][^\s"'<>{}|\\^\x60\[\])*#]*)?`)
	reWSURL              = regexp.MustCompile(`wss?://[a-zA-Z0-9][a-zA-Z0-9._-]*\.[a-zA-Z]{2,}[^\s"'<>{}|\\^\x60\[\]]*`)
	reEmail              = regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`)
	reSrc                = regexp.MustCompile(`(?:src|href)\s*=\s*["']([^"']*\.(?:js|mjs)(?:\?[^"']*)?)["']`)
	reNextChunk          = regexp.MustCompile(`"(static/chunks/[^"]+\.js)(?:\?[^"]*)?`)
	reDplParam           = regexp.MustCompile(`dpl=(dpl_[a-zA-Z0-9]+)`)
	reBuildFiles         = regexp.MustCompile(`(/_next/static/[^"'\s]+(?:_buildManifest|_ssgManifest|_middlewareManifest)\.js(?:\?[^"'\s]*)?)`)
	reViteChunk          = regexp.MustCompile(`"(/assets/[^"]+\.js)"`)
	reDynImport          = regexp.MustCompile(`import\s*\(\s*["']([^"']+\.(?:js|mjs))["']`)
	reModPreload         = regexp.MustCompile(`<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']`)
	reImportMap          = regexp.MustCompile(`<script[^>]+type=["']importmap["'][^>]*>([\s\S]*?)</script>`)
	reImportURL          = regexp.MustCompile(`"([^"]+\.(?:js|mjs))"`)
	reSourceMap          = regexp.MustCompile(`//[#@]\s*sourceMappingURL=(\S+)`)
	reBuildManifestChunk = regexp.MustCompile(`"(static/(?:chunks|css)/[^"]+\.js)"`)
)

var urlNoise = map[string]bool{
	"w3.org": true, "www.w3.org": true, "schema.org": true,
	"reactjs.org": true, "react.dev": true, "nextjs.org": true,
	"nodejs.org": true, "vuejs.org": true, "angular.io": true,
	"svelte.dev": true, "nuxt.com": true,
	"github.com": true, "npmjs.com": true, "npmjs.org": true,
	"unpkg.com": true, "esm.sh": true, "esm.run": true,
	"cdnjs.cloudflare.com": true, "cdn.jsdelivr.net": true,
	"fonts.googleapis.com": true, "fonts.gstatic.com": true,
	"googleapis.com": true, "gstatic.com": true,
	"polyfill.io": true, "tc39.es": true,
	"developer.mozilla.org": true, "mozilla.org": true,
	"creativecommons.org": true, "ecma-international.org": true,
	"vercel.com": true, "vercel.app": true, "vercel.link": true,
	"webpack.js.org": true, "babeljs.io": true,
	"typescriptlang.org": true, "json-schema.org": true,
	"openapis.org": true, "swagger.io": true,
	"lodash.com": true, "underscorejs.org": true,
	"jquery.com": true, "bootstrapcdn.com": true,
	"cloudflare.com": true, "fastly.net": true,
	"akamaihd.net": true, "akamaized.net": true,
	"sentry.io": true, "sentry-cdn.com": true,
}

var emailNoise = []string{
	"@example.com", "@test.com", "@localhost",
	"noreply@", "no-reply@", "@sentry.",
	"@types/", ".d.ts", "@babel",
	"@next", "@vercel", "@webpack",
	"@jest", "@testing", "@rollup",
	"@eslint", "@prettier",
}

func buildPatterns() []patternDef {
	raw := []struct{ name, category, expr string }{
		{"helius_rpc_key", "SECRET", `helius-rpc\.com/?\?api-key=([a-f0-9-]{36})`},
		{"infura_key", "SECRET", `infura\.io/v3/([a-f0-9]{32})`},
		{"alchemy_key", "SECRET", `(?:alchemy\.com|alchemyapi\.io)/v2/([a-zA-Z0-9_-]{32,})`},
		{"generic_api_key_assign", "SECRET", `(?:api[_-]?key|apiKey|API_KEY)\s*[:=]\s*["']([a-zA-Z0-9_-]{20,})["']`},
		{"bearer_token", "SECRET", `[Bb]earer\s+([a-zA-Z0-9_.-]{20,})`},
		{"jwt_token", "SECRET", `(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})`},
		{"aws_access_key", "SECRET", `(AKIA[0-9A-Z]{16})`},
		{"aws_secret_key", "SECRET", `(?:aws.?secret|secret.?key|SecretAccessKey)\s*[:=]\s*["']([a-zA-Z0-9/+=]{40})["']`},
		{"private_key_pem", "SECRET", `(-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----)`},
		{"github_pat", "SECRET", `(ghp_[a-zA-Z0-9]{36})`},
		{"github_oauth_token", "SECRET", `(gho_[a-zA-Z0-9]{36})`},
		{"github_app_token", "SECRET", `(ghu_[a-zA-Z0-9]{36})`},
		{"slack_token", "SECRET", `(xox[bpors]-[a-zA-Z0-9-]{10,})`},
		{"stripe_secret", "SECRET", `(sk_(?:live|test)_[a-zA-Z0-9]{24,})`},
		{"stripe_publishable", "CONFIG", `(pk_(?:live|test)_[a-zA-Z0-9]{24,})`},
		{"sendgrid_key", "SECRET", `(SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43})`},
		{"twilio_key", "SECRET", `(SK[a-f0-9]{32})`},
		{"mailgun_key", "SECRET", `(key-[a-zA-Z0-9]{32})`},
		{"square_token", "SECRET", `(sq0[a-z]{3}-[a-zA-Z0-9_-]{22,})`},
		{"shopify_token", "SECRET", `(shpat_[a-fA-F0-9]{32})`},
		{"heroku_key", "SECRET", `(?:HEROKU_API_KEY|heroku.?key)\s*[:=]\s*["']([a-f0-9-]{36})["']`},
		{"firebase_key", "SECRET", `(AIza[a-zA-Z0-9_-]{35})`},
		{"gcp_service_account", "SECRET", `("type"\s*:\s*"service_account")`},
		{"npm_token", "SECRET", `(npm_[a-zA-Z0-9]{36})`},
		{"sentry_dsn", "SECRET", `https://([a-f0-9]{32})@[a-z0-9]+\.ingest\.(?:us\.)?sentry\.io/\d+`},
		{"datadog_api_key", "SECRET", `(?:DD_API_KEY|datadog.?key)\s*[:=]\s*["']([a-f0-9]{32})["']`},
		{"openai_key", "SECRET", `(sk-[a-zA-Z0-9]{48})`},
		{"anthropic_key", "SECRET", `(sk-ant-[a-zA-Z0-9_-]{40,})`},
		{"supabase_key", "SECRET", `(sbp_[a-f0-9]{40})`},
		{"postmark_token", "SECRET", `(?:POSTMARK|X-Postmark-Server-Token)\s*[:=]\s*["']([a-f0-9-]{36})["']`},
		{"mapbox_token", "CONFIG", `(pk\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)`},
		{"algolia_key", "CONFIG", `(?:algolia|ALGOLIA)\s*[:=].*?["']([a-f0-9]{32})["']`},
		{"turnkey_org_id", "KEY_MGMT", `(?:defaultOrganizationId|organizationId)\s*[:=]\s*["']([a-f0-9-]{36})["']`},
		{"turnkey_api_url", "KEY_MGMT", `(https://api\.turnkey\.com)`},
		{"turnkey_rp_id", "KEY_MGMT", `rpId\s*[:=]\s*["']([a-zA-Z0-9._-]+)["']`},
		{"turnkey_iframe", "KEY_MGMT", `iframeUrl\s*[:=]\s*["'](https://auth\.turnkey\.com)["']`},
		{"walletconnect_project", "WALLET", `projectId\s*[:=]\s*["']([a-f0-9]{32})["']`},
		{"walletconnect_relay", "WALLET", `relayUrl\s*[:=]\s*["'](wss://[a-zA-Z0-9._/-]+)["']`},
		{"privy_app_id", "CONFIG", `(?:privyAppId|PRIVY_APP_ID)\s*[:=]\s*["']([a-z0-9-]+)["']`},
		{"sentry_public_key", "MONITORING", `sentry-public_key=([a-f0-9]{32})`},
		{"sentry_org_id", "MONITORING", `sentry-org_id=(\d+)`},
		{"sentry_release", "MONITORING", `sentry-release=([a-f0-9]{40})`},
		{"sentry_debug_id", "MONITORING", `_sentryDebugIds?\[.*?\]\s*=\s*["']([a-f0-9-]{36})["']`},
		{"sentry_environment", "MONITORING", `sentry-environment=([a-zA-Z0-9_-]+)`},
		{"gtm_id", "ANALYTICS", `(GTM-[A-Z0-9]{6,8})`},
		{"ga4_id", "ANALYTICS", `(G-[A-Z0-9]{10,12})`},
		{"ua_id", "ANALYTICS", `(UA-\d{4,}-\d{1,4})`},
		{"mixpanel_token", "ANALYTICS", `(?:mixpanel|MIXPANEL).*?token.*?["']([a-f0-9]{32})["']`},
		{"segment_key", "ANALYTICS", `(?:segment|SEGMENT).*?(?:key|writeKey).*?["']([a-zA-Z0-9]{20,})["']`},
		{"hotjar_id", "ANALYTICS", `(?:hotjar|hjid)\s*[:=]\s*["']?(\d{6,8})["']?`},
		{"intercom_app_id", "CONFIG", `(?:intercom|INTERCOM).*?app_?id.*?["']([a-z0-9]+)["']`},
		{"amplitude_key", "ANALYTICS", `(?:amplitude|AMPLITUDE).*?(?:key|apiKey).*?["']([a-f0-9]{32})["']`},
		{"posthog_key", "ANALYTICS", `(?:posthog|POSTHOG).*?(?:key|apiKey|token).*?["'](phc_[a-zA-Z0-9]{32,})["']`},
		{"logrocket_id", "ANALYTICS", `(?:LogRocket|logrocket)\.init\(["']([a-z0-9]+/[a-z0-9-]+)["']`},
		{"fullstory_org", "ANALYTICS", `(?:FullStory|fullstory|_fs_org)\s*[:=]\s*["']([A-Z0-9]+)["']`},
		{"nextjs_build_id", "BUILD", `"buildId"\s*:\s*"([a-zA-Z0-9_-]+)"`},
		{"vercel_deployment", "BUILD", `dpl_([a-zA-Z0-9]{20,})`},
		{"csp_nonce", "BUILD", `nonce="([a-zA-Z0-9+/=]{20,})"`},
		{"webpack_chunk_name", "BUILD", `webpackChunkName:\s*["']([^"']+)["']`},
		{"angular_version", "BUILD", `ng\.Version\(["'](\d+\.\d+\.\d+)["']\)`},
		{"react_version", "BUILD", `react[.-]dom[./](\d+\.\d+\.\d+)`},
		{"nextjs_server_action", "SERVER_ACTION", `createServerReference\("[a-f0-9]+",\s*[a-z.]+,\s*void\s+0,\s*[a-z.]+,\s*"([a-zA-Z0-9_]+)"\)`},
		{"nuxt_api_route", "SERVER_ACTION", `useFetch\(["'](/api/[^"']+)["']`},
		{"fetch_api_path", "SERVER_ACTION", `fetch\(["'](/api/[^"']+)["']`},
		{"graphql_endpoint", "SERVER_ACTION", `(?:graphql|GRAPHQL).*?(?:uri|endpoint|url)\s*[:=]\s*["']([^"']+)["']`},
		{"solana_rpc_url", "RPC", `(https://[a-zA-Z0-9._-]*(?:rpc|solana|helius|quicknode|alchemy|triton|genesysgo|rpcpool)[a-zA-Z0-9._-]*\.(?:com|io|net|xyz|so)[a-zA-Z0-9/._?&=-]*)`},
		{"ethereum_rpc_url", "RPC", `(https://[a-zA-Z0-9._-]*(?:mainnet|goerli|sepolia|infura|alchemy|eth)[a-zA-Z0-9._-]*\.(?:com|io|net)[a-zA-Z0-9/._?&=-]*)`},
		{"solana_program_id", "BLOCKCHAIN", `(?:programId|program_id|PROGRAM_ID)\s*[:=]\s*["']([1-9A-HJ-NP-Za-km-z]{32,44})["']`},
		{"solana_pubkey_ctor", "BLOCKCHAIN", `new\s+PublicKey\(["']([1-9A-HJ-NP-Za-km-z]{32,44})["']\)`},
		{"eth_contract_addr", "BLOCKCHAIN", `(0x[a-fA-F0-9]{40})`},
		{"oauth_client_id", "OAUTH", `(?:client_?[Ii]d|CLIENT_ID|clientId)\s*[:=]\s*["']([a-zA-Z0-9._-]{15,})["']`},
		{"google_oauth_client", "OAUTH", `(\d+-[a-z0-9]+\.apps\.googleusercontent\.com)`},
		{"auth0_domain", "OAUTH", `(?:auth0|AUTH0).*?domain.*?["']([a-zA-Z0-9-]+\.(?:auth0\.com|us\.auth0\.com))["']`},
		{"cognito_pool", "OAUTH", `((?:us|eu|ap)-[a-z]+-\d+_[a-zA-Z0-9]+)`},
		{"clerk_publishable", "OAUTH", `(pk_(?:live|test)_[a-zA-Z0-9]+)`},
		{"process_env_var", "ENV_VAR", `process\.env\.([A-Z][A-Z0-9_]{3,})`},
		{"next_public_var", "ENV_VAR", `(NEXT_PUBLIC_[A-Z][A-Z0-9_]{3,})`},
		{"vite_env_var", "ENV_VAR", `(VITE_[A-Z][A-Z0-9_]{3,})`},
		{"nuxt_env_var", "ENV_VAR", `(NUXT_[A-Z][A-Z0-9_]{3,})`},
		{"react_app_var", "ENV_VAR", `(REACT_APP_[A-Z][A-Z0-9_]{3,})`},
		{"source_map_url", "SOURCE_MAP", `//[#@]\s*sourceMappingURL=(\S+)`},
	}
	out := make([]patternDef, 0, len(raw))
	for _, r := range raw {
		out = append(out, patternDef{r.name, r.category, regexp.MustCompile(r.expr)})
	}
	return out
}
