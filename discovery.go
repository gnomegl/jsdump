package main

import (
	"net/url"
	"strings"
)

// discoverChunks finds all JS URLs referenced from an HTML document.
// It handles Next.js, Nuxt, Vite, CRA, Angular, generic <script> tags,
// inline RSC payloads, buildManifest references, and importmap entries.
func discoverChunks(html string, baseURL *url.URL) []string {
	seen := make(map[string]bool)
	var out []string

	add := func(raw string) {
		u := resolveURL(baseURL.String(), raw)
		if u == "" || seen[u] {
			return
		}
		if !isJSURL(u) {
			return
		}
		seen[u] = true
		out = append(out, u)
	}

	// 1. <script src="..."> and <link ... href="..."> for preloads
	for _, m := range reSrc.FindAllStringSubmatch(html, -1) {
		add(m[1])
	}

	// 2. Next.js RSC payload — "static/chunks/..."
	dplParam := ""
	if dm := reDplParam.FindStringSubmatch(html); len(dm) > 1 {
		dplParam = "?dpl=" + dm[1]
	}
	for _, m := range reNextChunk.FindAllStringSubmatch(html, -1) {
		path := "/_next/" + m[1]
		if dplParam != "" && !strings.Contains(path, "?") {
			path += dplParam
		}
		add(path)
	}

	// 3. _buildManifest.js / _ssgManifest.js / _middlewareManifest.js
	for _, m := range reBuildFiles.FindAllStringSubmatch(html, -1) {
		add(m[1])
	}

	// 4. Vite / Rollup manifest references
	for _, m := range reViteChunk.FindAllStringSubmatch(html, -1) {
		add(m[1])
	}

	// 5. import() or import("...") dynamic imports in inline scripts
	for _, m := range reDynImport.FindAllStringSubmatch(html, -1) {
		add(m[1])
	}

	// 6. modulepreload
	for _, m := range reModPreload.FindAllStringSubmatch(html, -1) {
		add(m[1])
	}

	// 7. importmap JSON
	for _, m := range reImportMap.FindAllStringSubmatch(html, -1) {
		for _, u := range reImportURL.FindAllStringSubmatch(m[1], -1) {
			add(u[1])
		}
	}

	// 8. Generic absolute JS URLs found anywhere in the HTML
	for _, m := range reFullURL.FindAllString(html, -1) {
		if isJSURL(m) {
			add(m)
		}
	}

	return out
}

// discoverChunksFromBuildManifest parses a Next.js _buildManifest.js response
// and extracts additional chunk paths.
func discoverChunksFromBuildManifest(body string, baseURL *url.URL) []string {
	var out []string
	for _, m := range reBuildManifestChunk.FindAllStringSubmatch(body, -1) {
		u := baseURL.Scheme + "://" + baseURL.Host + "/_next/" + m[1]
		out = append(out, u)
	}
	return out
}

func isJSURL(u string) bool {
	parsed, err := url.Parse(u)
	if err != nil {
		return false
	}
	p := strings.ToLower(parsed.Path)
	return strings.HasSuffix(p, ".js") || strings.HasSuffix(p, ".mjs")
}
