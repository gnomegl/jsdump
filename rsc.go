package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"unicode"
)

// RSC wire format line patterns:
//
//	0:["$","div",null,{"children":...}]          — React element tree with serialized props
//	1:I["(app-pages-browser)/./...","default"]    — Client component module reference
//	2:["$","$L3",null,{"config":{"dbUrl":"..."}}] — Props passed across the boundary
//	3:D{"name":"...","env":"..."}                  — Debug/metadata chunk
//	S:"string value"                               — Standalone string values
//	T:base64data                                   — Binary/text transfer
var (
	// Extracts the JSON payloads from self.__next_f.push([1,"..."]) calls embedded in HTML <script> tags.
	// Next.js streams RSC data by pushing stringified chunks into this array.
	reNextFPush = regexp.MustCompile(`self\.__next_f\.push\(\[(\d+),\s*"((?:[^"\\]|\\.)*)"\]\)`)

	// Matches RSC wire format lines: <id>:<type><json_payload>
	// The wire format is newline-delimited, each line starts with a row ID, colon, then a type hint + JSON.
	reRSCLine = regexp.MustCompile(`^([0-9a-f]+):(.+)$`)

	// Detect Next.js App Router — presence of __next_f on the page is the signal.
	reNextAppRouter = regexp.MustCompile(`self\.__next_f`)

	// Route segment paths from the app-pages-browser manifest or chunk references.
	// These map to filesystem routes in the App Router, each of which can be probed for RSC payloads.
	reAppRouteSegment = regexp.MustCompile(`\(app-pages-browser\)/\./(?:app|src/app)/([^"]+?)(?:/page|/layout|/loading|/error|/not-found)`)

	// Alternative: routes from _buildManifest or __next_route_announcer patterns
	reManifestRoute = regexp.MustCompile(`"(/[a-zA-Z0-9_/\[\]-]*)":\s*\[`)

	// Catches JSON-like prop objects in RSC wire format — looking for key-value patterns
	// that suggest serialized config/data crossing the server→client boundary.
	reRSCPropObject = regexp.MustCompile(`\{[^{}]*"(?:password|secret|token|key|credential|dsn|connectionString|databaseUrl|dbUrl|apiSecret|privateKey|accessToken|refreshToken|serviceKey|masterKey|adminKey|rootPassword|encryptionKey|signingKey|webhookSecret)"[^{}]*\}`)

	// Detects internal/private network URLs that should never appear in client payloads.
	reInternalURL = regexp.MustCompile(`https?://(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)(?::\d+)?[^\s"'<>]*`)

	// Detects database connection strings (postgres, mysql, mongodb, redis) that leaked through RSC.
	reDBConnString = regexp.MustCompile(`(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqp|amqps)://[^\s"'<>\\]+`)

	// Matches raw env var assignments in RSC payloads — server-side vars that crossed the boundary.
	// Different from the existing process.env patterns because these appear as literal values in RSC JSON.
	reRSCEnvLeak = regexp.MustCompile(`"(?:DATABASE_URL|DB_URL|DB_HOST|DB_PASSWORD|DB_CONNECTION|REDIS_URL|MONGODB_URI|MONGO_URL|INTERNAL_API_URL|INTERNAL_API_KEY|SECRET_KEY|SESSION_SECRET|ENCRYPTION_KEY|SIGNING_KEY|ADMIN_SECRET|MASTER_KEY|WEBHOOK_SECRET|PRIVATE_KEY|SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY|FIREBASE_ADMIN_SDK|GOOGLE_APPLICATION_CREDENTIALS|AWS_SECRET_ACCESS_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|STRIPE_SECRET_KEY|SENDGRID_API_KEY|TWILIO_AUTH_TOKEN|GITHUB_TOKEN|NPM_TOKEN)"\s*:\s*"([^"]+)"`)
)

// extractRSCPayloads pulls all RSC flight data from inline <script> tags in the initial HTML.
// Next.js App Router injects these as self.__next_f.push([<seq>, "<escaped_json>"]) calls.
// Each push contains a chunk of the RSC wire format that we need to reassemble and parse.
func extractRSCPayloads(html string) []string {
	var payloads []string
	for _, m := range reNextFPush.FindAllStringSubmatch(html, -1) {
		decoded := unescapeRSCString(m[2])
		if len(decoded) > 0 {
			payloads = append(payloads, decoded)
		}
	}
	return payloads
}

// unescapeRSCString handles the JS string escaping used in __next_f.push payloads.
// The RSC data is double-escaped: first as JSON, then embedded in a JS string literal.
func unescapeRSCString(s string) string {
	// The content is a JS string literal inside push([1, "..."]).
	// Handle standard JS escape sequences.
	var b strings.Builder
	b.Grow(len(s))
	i := 0
	for i < len(s) {
		if s[i] == '\\' && i+1 < len(s) {
			switch s[i+1] {
			case 'n':
				b.WriteByte('\n')
				i += 2
			case 'r':
				b.WriteByte('\r')
				i += 2
			case 't':
				b.WriteByte('\t')
				i += 2
			case '"':
				b.WriteByte('"')
				i += 2
			case '\'':
				b.WriteByte('\'')
				i += 2
			case '\\':
				b.WriteByte('\\')
				i += 2
			case '/':
				b.WriteByte('/')
				i += 2
			case 'u':
				// \uXXXX unicode escape
				if i+5 < len(s) {
					var r rune
					if _, err := json.Number("0x" + s[i+2:i+6]).Int64(); err == nil {
						n, _ := parseHex(s[i+2 : i+6])
						r = rune(n)
						b.WriteRune(r)
						i += 6
						continue
					}
				}
				b.WriteByte(s[i])
				i++
			default:
				b.WriteByte(s[i])
				b.WriteByte(s[i+1])
				i += 2
			}
		} else {
			b.WriteByte(s[i])
			i++
		}
	}
	return b.String()
}

func parseHex(s string) (int64, error) {
	var n int64
	for _, c := range s {
		n <<= 4
		switch {
		case c >= '0' && c <= '9':
			n |= int64(c - '0')
		case c >= 'a' && c <= 'f':
			n |= int64(c-'a') + 10
		case c >= 'A' && c <= 'F':
			n |= int64(c-'A') + 10
		default:
			return 0, fmt.Errorf("invalid hex char: %c", c)
		}
	}
	return n, nil
}

// parseRSCWireFormat splits reassembled RSC data into individual lines and extracts
// the JSON payloads from each. Returns the raw text content suitable for pattern matching.
func parseRSCWireFormat(payloads []string) []rscChunk {
	var chunks []rscChunk
	for _, payload := range payloads {
		for _, line := range strings.Split(payload, "\n") {
			line = strings.TrimSpace(line)
			if len(line) == 0 {
				continue
			}
			m := reRSCLine.FindStringSubmatch(line)
			if m == nil {
				// Some payloads are just raw JSON fragments without the ID: prefix
				// (happens with streaming chunks that got concatenated)
				if len(line) > 2 && (line[0] == '[' || line[0] == '{' || line[0] == '"') {
					chunks = append(chunks, rscChunk{ID: "?", RawContent: line})
				}
				continue
			}
			chunks = append(chunks, rscChunk{ID: m[1], RawContent: m[2]})
		}
	}
	return chunks
}

type rscChunk struct {
	ID         string
	RawContent string
}

// extractRSCFindings runs targeted extraction on decoded RSC wire format data.
// This catches stuff that the normal JS regex patterns would miss because:
// 1. RSC data lives in HTML <script> tags, not .js files
// 2. The serialization format wraps values differently than JS source
// 3. Server-side values appear as raw strings in the wire format, not behind process.env
func extractRSCFindings(chunks []rscChunk, source string, pats []patternDef) []Finding {
	var findings []Finding

	for _, chunk := range chunks {
		content := chunk.RawContent

		// Run the standard pattern matching against the decoded RSC content.
		// This catches API keys, tokens, etc. that were serialized into props.
		for _, p := range pats {
			if p.name == "source_map_url" {
				continue
			}
			for _, m := range p.re.FindAllStringSubmatch(content, -1) {
				val := m[0]
				if len(m) > 1 {
					val = m[1]
				}
				if len(val) < 3 || (p.name == "eth_contract_addr" && isBoringEthAddr(val)) {
					continue
				}
				findings = append(findings, Finding{
					Category: p.category,
					Key:      p.name,
					Value:    val,
					Source:   source + " [RSC:" + chunk.ID + "]",
					Context:  getContext(content, m[0], 120),
				})
			}
		}

		// RSC-specific: detect leaked server prop objects with sensitive key names
		for _, m := range reRSCPropObject.FindAllString(content, -1) {
			findings = append(findings, Finding{
				Category: "RSC_LEAK",
				Key:      "rsc_sensitive_prop",
				Value:    trunc(m, 200),
				Source:   source + " [RSC:" + chunk.ID + "]",
				Context:  "Server Component prop containing sensitive key names — possible backend data leak across serialization boundary",
			})
		}

		// RSC-specific: internal/private network URLs that leaked through serialization
		for _, m := range reInternalURL.FindAllString(content, -1) {
			if !isBoringInternalURL(m) {
				findings = append(findings, Finding{
					Category: "RSC_LEAK",
					Key:      "rsc_internal_url",
					Value:    m,
					Source:   source + " [RSC:" + chunk.ID + "]",
					Context:  "Internal/private network URL serialized into RSC payload — backend infrastructure exposed to client",
				})
			}
		}

		// RSC-specific: database connection strings that crossed the boundary
		for _, m := range reDBConnString.FindAllString(content, -1) {
			findings = append(findings, Finding{
				Category: "RSC_LEAK",
				Key:      "rsc_database_url",
				Value:    m,
				Source:   source + " [RSC:" + chunk.ID + "]",
				Context:  "Database connection string serialized into RSC payload — credentials exposed to client",
			})
		}

		// RSC-specific: server-side env var values that leaked as literal strings
		for _, m := range reRSCEnvLeak.FindAllStringSubmatch(content, -1) {
			findings = append(findings, Finding{
				Category: "RSC_LEAK",
				Key:      "rsc_env_leak",
				Value:    m[0],
				Source:   source + " [RSC:" + chunk.ID + "]",
				Context:  "Server-side environment variable value leaked through RSC serialization boundary",
			})
		}

		// Look for large serialized JSON objects in props — these often contain
		// entire server config objects that a developer accidentally passed as a prop.
		extractLeakedPropBlobs(content, chunk.ID, source, &findings)
	}

	return findings
}

// extractLeakedPropBlobs looks for suspiciously large JSON objects in RSC payloads
// that suggest a developer passed an entire server config/result object as a prop
// instead of cherry-picking safe fields.
func extractLeakedPropBlobs(content, chunkID, source string, findings *[]Finding) {
	// Walk through the content looking for JSON objects. We don't fully parse
	// (RSC wire format isn't standard JSON) but we look for {...} blocks that
	// contain many keys — a sign of accidental full-object serialization.
	depth := 0
	start := -1
	for i, c := range content {
		switch c {
		case '{':
			if depth == 0 {
				start = i
			}
			depth++
		case '}':
			depth--
			if depth == 0 && start >= 0 {
				blob := content[start : i+1]
				if len(blob) > 500 { // Suspiciously large prop object
					keyCount := countJSONKeys(blob)
					if keyCount >= 10 {
						*findings = append(*findings, Finding{
							Category: "RSC_LEAK",
							Key:      "rsc_large_prop_blob",
							Value:    fmt.Sprintf("%d keys, %d bytes", keyCount, len(blob)),
							Source:   source + " [RSC:" + chunkID + "]",
							Context:  "Large object serialized across RSC boundary (" + trunc(blob, 200) + ")",
						})
					}
				}
				start = -1
			}
		}
	}
}

// countJSONKeys does a rough count of quoted keys in a JSON-like string.
func countJSONKeys(s string) int {
	count := 0
	inStr := false
	escaped := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		if escaped {
			escaped = false
			continue
		}
		if c == '\\' {
			escaped = true
			continue
		}
		if c == '"' {
			inStr = !inStr
			// Check if this is a key (preceded by { or ,)
			if inStr {
				// Look backwards for : to determine if we're at a key position
				j := i - 1
				for j >= 0 && (s[j] == ' ' || s[j] == '\t' || s[j] == '\n' || s[j] == '\r') {
					j--
				}
				if j >= 0 && (s[j] == '{' || s[j] == ',') {
					count++
				}
			}
		}
	}
	return count
}

// isBoringInternalURL filters out common false positives for internal URL detection.
func isBoringInternalURL(u string) bool {
	lower := strings.ToLower(u)
	// localhost references that are clearly dev/doc boilerplate
	if strings.Contains(lower, "localhost:3000") && !strings.Contains(lower, "/api/") {
		return true
	}
	// Common example/placeholder patterns
	if strings.Contains(lower, "example") || strings.Contains(lower, "placeholder") {
		return true
	}
	return false
}

// discoverAppRoutes extracts App Router route segments from JS chunks and build manifests.
// Each route can be probed with RSC flight requests to extract server-rendered data.
func discoverAppRoutes(html string, chunks []string, chunkBodies map[string]string) []string {
	seen := make(map[string]bool)
	var routes []string

	add := func(route string) {
		// Normalize route path
		route = "/" + strings.TrimPrefix(route, "/")
		route = strings.TrimSuffix(route, "/page")
		route = strings.TrimSuffix(route, "/layout")
		// Skip catch-all/dynamic segments for now — we'd need to know valid params
		if strings.Contains(route, "[...") {
			return
		}
		// Clean up route
		if route == "" || route == "/" {
			route = "/"
		}
		if !seen[route] {
			seen[route] = true
			routes = append(routes, route)
		}
	}

	// From the initial HTML
	for _, m := range reAppRouteSegment.FindAllStringSubmatch(html, -1) {
		add(m[1])
	}

	// From fetched chunk bodies (buildManifest etc.)
	for _, body := range chunkBodies {
		for _, m := range reAppRouteSegment.FindAllStringSubmatch(body, -1) {
			add(m[1])
		}
		for _, m := range reManifestRoute.FindAllStringSubmatch(body, -1) {
			route := m[1]
			// Filter out non-page routes
			if strings.HasPrefix(route, "/_next") || strings.HasPrefix(route, "/_error") {
				continue
			}
			add(route)
		}
	}

	return routes
}

// fetchRSCFlight makes a flight request to a route to get the RSC wire format response.
// Next.js serves RSC payloads when the request includes the RSC header.
// This is how client-side navigation works — instead of full HTML, you get the serialized
// component tree for just that route segment.
func fetchRSCFlight(client *http.Client, baseURL *url.URL, route, userAgent string) (string, int, error) {
	u := baseURL.Scheme + "://" + baseURL.Host + route
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "text/x-component")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Accept-Encoding", "identity")
	// The RSC header tells Next.js to respond with flight data instead of HTML.
	// The value is an opaque identifier — "1" works universally.
	req.Header.Set("RSC", "1")
	// Next-Router headers help Next.js identify this as a client navigation request.
	req.Header.Set("Next-Router-State-Tree", `%5B%22%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D`)
	req.Header.Set("Next-Url", route)

	resp, err := client.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()

	// Check content type — RSC responses have text/x-component
	ct := resp.Header.Get("Content-Type")
	isRSC := strings.Contains(ct, "text/x-component") ||
		strings.Contains(ct, "application/octet-stream") ||
		resp.StatusCode == 200

	if resp.StatusCode != 200 || !isRSC {
		return "", resp.StatusCode, nil
	}

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", resp.StatusCode, err
	}

	body := string(raw)

	// Validate this actually looks like RSC wire format, not just HTML
	if isLikelyRSCPayload(body) {
		return body, resp.StatusCode, nil
	}

	return "", resp.StatusCode, nil
}

// isLikelyRSCPayload checks if a response body looks like RSC wire format
// rather than regular HTML or JSON.
func isLikelyRSCPayload(body string) bool {
	if len(body) < 3 {
		return false
	}
	// RSC wire format starts with "0:" or similar digit-colon patterns
	trimmed := strings.TrimLeftFunc(body, unicode.IsSpace)
	if len(trimmed) > 2 && trimmed[0] >= '0' && trimmed[0] <= '9' && trimmed[1] == ':' {
		return true
	}
	// Could also start with hex IDs
	if reRSCLine.MatchString(strings.SplitN(trimmed, "\n", 2)[0]) {
		return true
	}
	return false
}

// RSCResult tracks what we found from RSC analysis for reporting.
type RSCResult struct {
	Route       string `json:"route"`
	Source      string `json:"source"` // "inline" or "flight"
	PayloadSize int    `json:"payload_size"`
	ChunkCount  int    `json:"chunk_count"`
	HasLeaks    bool   `json:"has_leaks"`
}
