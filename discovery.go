package main

import (
	"net/url"
	"strings"
)

func discoverChunks(html string, baseURL *url.URL) []string {
	seen := make(map[string]bool)
	var out []string
	add := func(raw string) {
		u := resolveURL(baseURL.String(), raw)
		if u == "" || seen[u] || !isJSURL(u) {
			return
		}
		seen[u] = true
		out = append(out, u)
	}
	for _, m := range reSrc.FindAllStringSubmatch(html, -1) {
		add(m[1])
	}
	// Next.js deployment parameter — appended to chunk URLs for cache busting
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
	for _, m := range reBuildFiles.FindAllStringSubmatch(html, -1) {
		add(m[1])
	}
	for _, m := range reViteChunk.FindAllStringSubmatch(html, -1) {
		add(m[1])
	}
	for _, m := range reDynImport.FindAllStringSubmatch(html, -1) {
		add(m[1])
	}
	for _, m := range reModPreload.FindAllStringSubmatch(html, -1) {
		add(m[1])
	}
	for _, m := range reImportMap.FindAllStringSubmatch(html, -1) {
		for _, u := range reImportURL.FindAllStringSubmatch(m[1], -1) {
			add(u[1])
		}
	}
	for _, m := range reFullURL.FindAllString(html, -1) {
		if isJSURL(m) {
			add(m)
		}
	}
	return out
}

func discoverChunksFromBuildManifest(body string, baseURL *url.URL) []string {
	var out []string
	for _, m := range reBuildManifestChunk.FindAllStringSubmatch(body, -1) {
		out = append(out, baseURL.Scheme+"://"+baseURL.Host+"/_next/"+m[1])
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
