package main

import (
	"net/url"
	"sort"
	"strings"
)

func resolveURL(base, ref string) string {
	if strings.HasPrefix(ref, "http://") || strings.HasPrefix(ref, "https://") {
		return ref
	}
	b, err := url.Parse(base)
	if err != nil {
		return ""
	}
	r, err := url.Parse(ref)
	if err != nil {
		return ""
	}
	return b.ResolveReference(r).String()
}

func getContext(content, match string, window int) string {
	idx := strings.Index(content, match)
	if idx == -1 {
		return ""
	}
	start, end := idx-window, idx+len(match)+window
	if start < 0 {
		start = 0
	}
	if end > len(content) {
		end = len(content)
	}
	ctx := strings.Map(func(r rune) rune {
		if r == '\n' || r == '\r' || r == '\t' {
			return ' '
		}
		return r
	}, content[start:end])
	if len(ctx) > 250 {
		ctx = ctx[:250] + "..."
	}
	return ctx
}

func dedup(findings []Finding) []Finding {
	seen := make(map[string]bool)
	var result []Finding
	for _, f := range findings {
		key := f.Category + "|" + f.Key + "|" + f.Value
		if !seen[key] {
			seen[key] = true
			result = append(result, f)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Category != result[j].Category {
			return result[i].Category < result[j].Category
		}
		if result[i].Key != result[j].Key {
			return result[i].Key < result[j].Key
		}
		return result[i].Value < result[j].Value
	})
	return result
}

func trunc(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-3] + "..."
}

// categoryOrder defines the output ordering — high-value categories first.
var categoryOrder = []string{
	"SECRET", "RSC_LEAK", "SOURCE_MAP", "OAUTH",
	"BAAS", "KEY_MGMT", "RPC", "CONFIG",
	"MONITORING", "ANALYTICS", "SERVER_ACTION",
	"WALLET", "BLOCKCHAIN", "ENV_VAR", "BUILD",
	"URL", "WEBSOCKET", "EMAIL",
}

// toOutput converts an internal Report to the JSON output format
// with categories as top-level keys, ordered by severity.
func toOutput(r Report) OutputReport {
	grouped := make(map[string][]Finding)
	for _, f := range r.Findings {
		cat := strings.ToLower(f.Category)
		grouped[cat] = append(grouped[cat], f)
	}

	// Build key order: categoryOrder first, then any extras.
	var keys []string
	seen := make(map[string]bool)
	for _, cat := range categoryOrder {
		key := strings.ToLower(cat)
		if _, ok := grouped[key]; ok {
			keys = append(keys, key)
			seen[key] = true
		}
	}
	for cat := range grouped {
		if !seen[cat] {
			keys = append(keys, cat)
		}
	}

	// Filter source maps — only include 200s.
	var exposedMaps []SourceMapResult
	for _, sm := range r.SourceMaps {
		if sm.StatusCode == 200 {
			exposedMaps = append(exposedMaps, sm)
		}
	}

	// Build summary stats.
	totalFindings := 0
	categoryCounts := make(map[string]int)
	uniqueKeys := make(map[string]bool)
	for cat, findings := range grouped {
		categoryCounts[cat] = len(findings)
		totalFindings += len(findings)
		for _, f := range findings {
			uniqueKeys[f.Key] = true
		}
	}
	rscLeaks := 0
	for _, rsc := range r.RSCPayloads {
		if rsc.HasLeaks {
			rscLeaks++
		}
	}

	return OutputReport{
		Target:      r.Target,
		Timestamp:   r.Timestamp,
		ChunksFound: r.ChunksFound,
		Findings:    OrderedFindings{Keys: keys, Groups: grouped},
		SourceMaps:  exposedMaps,
		RSCPayloads: r.RSCPayloads,
		ChunkURLs:   r.ChunkURLs,
		Summary: Summary{
			TotalFindings:     totalFindings,
			Categories:        categoryCounts,
			UniqueKeys:        len(uniqueKeys),
			SourceMapsExposed: len(exposedMaps),
			RSCLeaks:          rscLeaks,
			ChunksScanned:     r.ChunksFound,
		},
	}
}
