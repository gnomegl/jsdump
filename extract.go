package main

import (
	"net/url"
	"strings"
)

func extractFindings(content, source string, pats []patternDef) []Finding {
	var findings []Finding
	for _, p := range pats {
		if p.name == "source_map_url" {
			continue // handled separately during chunk download via sourceMappingURL directive
		}
		for _, m := range p.re.FindAllStringSubmatch(content, -1) {
			val := m[0]
			if len(m) > 1 {
				val = m[1]
			}
			if len(val) < 3 || (p.name == "eth_contract_addr" && isBoringEthAddr(val)) {
				continue
			}
			findings = append(findings, Finding{Category: p.category, Key: p.name, Value: val, Source: source, Context: getContext(content, m[0], 100)})
		}
	}
	for _, u := range reFullURL.FindAllString(content, -1) {
		if isInterestingURL(u) {
			findings = append(findings, Finding{Category: "URL", Key: classifyURL(u), Value: u, Source: source})
		}
	}
	for _, u := range reWSURL.FindAllString(content, -1) {
		findings = append(findings, Finding{Category: "WEBSOCKET", Key: "websocket_url", Value: u, Source: source})
	}
	for _, e := range reEmail.FindAllString(content, -1) {
		if isInterestingEmail(e) {
			findings = append(findings, Finding{Category: "EMAIL", Key: "email", Value: e, Source: source})
		}
	}
	return findings
}

var boringEth = []string{"0000000000000000000000000000000000000000", "ffffffffffffffffffffffffffffffffffffffff", "1111111111111111111111111111111111111111", "dead000000000000000000000000000000000000"}

func isBoringEthAddr(addr string) bool {
	clean := strings.ToLower(strings.TrimPrefix(addr, "0x"))
	if len(clean) != 40 {
		return true
	}
	for _, b := range boringEth {
		if clean == b {
			return true
		}
	}
	return false
}

var staticExts = []string{".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".webp"}

func isInterestingURL(u string) bool {
	parsed, err := url.Parse(u)
	if err != nil || parsed.Host == "" {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	for noisy := range urlNoise {
		if host == noisy || strings.HasSuffix(host, "."+noisy) {
			return false
		}
	}
	if strings.HasPrefix(u, "data:") || strings.HasPrefix(u, "blob:") {
		return false
	}
	if len(parsed.Path) <= 1 && parsed.RawQuery == "" {
		return false
	}
	lower := strings.ToLower(parsed.Path)
	for _, ext := range staticExts {
		if strings.HasSuffix(lower, ext) {
			return false
		}
	}
	return true
}

func classifyURL(u string) string {
	lower := strings.ToLower(u)
	switch {
	case strings.Contains(lower, "/api/") || strings.Contains(lower, "/api?"):
		return "api_url"
	case strings.Contains(lower, "rpc") || strings.Contains(lower, "solana") || strings.Contains(lower, "helius") || strings.Contains(lower, "infura") || strings.Contains(lower, "alchemy"):
		return "rpc_url"
	case strings.Contains(lower, "auth") || strings.Contains(lower, "login") || strings.Contains(lower, "oauth"):
		return "auth_url"
	case strings.Contains(lower, "cdn") || strings.Contains(lower, "static") || strings.Contains(lower, "assets"):
		return "cdn_url"
	case strings.Contains(lower, "graphql"):
		return "graphql_url"
	case strings.Contains(lower, "webhook"):
		return "webhook_url"
	case strings.Contains(lower, "ws://") || strings.Contains(lower, "wss://"):
		return "websocket_url"
	default:
		return "discovered_url"
	}
}

func isInterestingEmail(email string) bool {
	lower := strings.ToLower(email)
	for _, n := range emailNoise {
		if strings.Contains(lower, n) {
			return false
		}
	}
	return true
}
