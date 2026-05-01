package main

import (
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type HTTPClient = http.Client

func newClient(timeoutSec, workers int, insecure bool) *http.Client {
	return &http.Client{
		Timeout: time.Duration(timeoutSec) * time.Second,
		Transport: &http.Transport{
			TLSClientConfig:     &tls.Config{InsecureSkipVerify: insecure},
			MaxIdleConnsPerHost: workers,
			MaxConnsPerHost:     workers * 2,
			IdleConnTimeout:     90 * time.Second,
		},
		CheckRedirect: func(_ *http.Request, via []*http.Request) error {
			if len(via) >= 8 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}
}

func fetch(client *http.Client, targetURL, userAgent string) (string, int, error) {
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Accept-Encoding", "identity") // no compression — we need raw text for regex extraction
	resp, err := client.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", resp.StatusCode, err
	}
	return string(body), resp.StatusCode, nil
}

// probeStatus tries HEAD then falls back to GET (some servers reject HEAD).
func probeStatus(client *http.Client, targetURL, userAgent string) int {
	req, _ := http.NewRequest("HEAD", targetURL, nil)
	if req == nil {
		return -1
	}
	req.Header.Set("User-Agent", userAgent)
	resp, err := client.Do(req)
	if err != nil {
		req, _ = http.NewRequest("GET", targetURL, nil)
		if req == nil {
			return -1
		}
		req.Header.Set("User-Agent", userAgent)
		resp, err = client.Do(req)
		if err != nil {
			return -1
		}
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	return resp.StatusCode
}

// publicCDNHosts are well-known public CDN/library hosts whose source maps
// are intentionally published and not a finding for the target.
var publicCDNHosts = []string{
	"cdnjs.cloudflare.com",
	"cdn.jsdelivr.net",
	"unpkg.com",
	"esm.sh",
	"esm.run",
	"ajax.googleapis.com",
	"code.jquery.com",
	"stackpath.bootstrapcdn.com",
	"cdn.skypack.dev",
	"ga.jspm.io",
	"cdn.statically.io",
}

func isPublicCDN(rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	for _, cdn := range publicCDNHosts {
		if host == cdn {
			return true
		}
	}
	return false
}

func probeSourceMap(client *http.Client, chunkURL, mapURL string, hasDirective, check bool, userAgent string) (SourceMapResult, *Finding) {
	smr := SourceMapResult{ChunkURL: chunkURL, MapURL: mapURL, HasDirective: hasDirective, StatusCode: -1}
	if !check {
		return smr, nil
	}

	// Skip source map probing for well-known public CDN libraries.
	// Their maps are intentionally published and not a target finding.
	if isPublicCDN(chunkURL) {
		return smr, nil
	}

	// GET the map URL and validate the response is actually a source map.
	// A 200 alone is not sufficient — many servers return HTML error pages,
	// Cloudflare challenges, or soft-404s with 200 status.
	req, err := http.NewRequest("GET", mapURL, nil)
	if err != nil {
		return smr, nil
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json, */*;q=0.1")
	resp, err := client.Do(req)
	if err != nil {
		return smr, nil
	}
	defer resp.Body.Close()

	smr.StatusCode = resp.StatusCode
	if resp.StatusCode != 200 {
		io.Copy(io.Discard, resp.Body)
		return smr, nil
	}

	// Read up to 4KB to validate — enough to see the JSON structure.
	peek := make([]byte, 4096)
	n, _ := io.ReadFull(resp.Body, peek)
	io.Copy(io.Discard, resp.Body)
	peek = peek[:n]

	if !looksLikeSourceMap(peek, resp.Header.Get("Content-Type")) {
		return smr, nil
	}

	smr.Validated = true
	ctx := "Source map publicly accessible (validated JSON source map)"
	if !hasDirective {
		ctx = "No directive, but .map URL serves valid source map"
	}
	return smr, &Finding{Category: "SOURCE_MAP", Key: "exposed_source_map", Value: mapURL, Source: chunkURL, Context: ctx}
}

// looksLikeSourceMap checks whether a response body is plausibly a source map
// rather than an HTML error page, Cloudflare challenge, or soft-404.
func looksLikeSourceMap(peek []byte, contentType string) bool {
	if len(peek) == 0 {
		return false
	}

	// Reject obvious HTML responses (error pages, challenges).
	s := string(peek)
	for _, sig := range []string{"<!doctype", "<!DOCTYPE", "<html", "<HTML", "<head", "<HEAD"} {
		if len(s) >= len(sig) && containsPrefix(s, sig) {
			return false
		}
	}

	// Source maps are JSON with required fields: "version" and "mappings".
	// A valid source map starts with '{' (possibly after whitespace/BOM).
	trimmed := trimLeftSpace(s)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return false
	}

	// Must contain at least "version" — present in every source map.
	hasVersion := contains(s, `"version"`)
	// And at least one of "mappings" or "sources" to confirm it's a source map.
	hasMappingsOrSources := contains(s, `"mappings"`) || contains(s, `"sources"`)

	return hasVersion && hasMappingsOrSources
}

func containsPrefix(s, prefix string) bool {
	ts := trimLeftSpace(s)
	if len(ts) < len(prefix) {
		return false
	}
	for i := 0; i < len(prefix); i++ {
		if ts[i] != prefix[i] {
			return false
		}
	}
	return true
}

func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func trimLeftSpace(s string) string {
	i := 0
	for i < len(s) && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r' || s[i] == 0xEF || s[i] == 0xBB || s[i] == 0xBF) {
		i++
	}
	return s[i:]
}
