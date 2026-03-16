package main

import (
	"fmt"
	"net/url"
	"os"
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

// getContext returns up to `window` chars on each side of `match` within `content`.
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

var catIcons = map[string]string{
	"SECRET": "!!", "SOURCE_MAP": "!!", "KEY_MGMT": ">>", "WALLET": ">>",
	"RPC": ">>", "MONITORING": "--", "ANALYTICS": "--", "SERVER_ACTION": "->",
	"URL": "..", "WEBSOCKET": "..", "EMAIL": "@@", "BUILD": "##",
	"BLOCKCHAIN": "$$", "ENV_VAR": "$$", "CONFIG": "::", "OAUTH": "::",
}

func printSummary(r Report) {
	w := os.Stderr
	fmt.Fprintln(w)
	fmt.Fprintln(w, "  ┌─────────────────────────────────────────────────────┐")
	fmt.Fprintln(w, "  │          JS Bundle Intelligence Report              │")
	fmt.Fprintln(w, "  ├─────────────────────────────────────────────────────┤")
	fmt.Fprintf(w, "  │  Target:   %-40s │\n", trunc(r.Target, 40))
	fmt.Fprintf(w, "  │  Chunks:   %-40d │\n", r.ChunksFound)
	fmt.Fprintf(w, "  │  Findings: %-40d │\n", len(r.Findings))
	fmt.Fprintln(w, "  ├─────────────────────────────────────────────────────┤")
	var cats []string
	for c := range r.Summary {
		cats = append(cats, c)
	}
	sort.Strings(cats)
	for _, cat := range cats {
		icon := catIcons[cat]
		if icon == "" {
			icon = "  "
		}
		fmt.Fprintf(w, "  │  %s  %-20s %26d │\n", icon, cat, r.Summary[cat])
	}
	mapsDirective, mapsExposed := 0, 0
	for _, sm := range r.SourceMaps {
		if sm.HasDirective {
			mapsDirective++
		}
		if sm.StatusCode == 200 {
			mapsExposed++
		}
	}
	fmt.Fprintln(w, "  ├─────────────────────────────────────────────────────┤")
	fmt.Fprintf(w, "  │  Source Maps: %d directives, %d exposed              │\n", mapsDirective, mapsExposed)
	fmt.Fprintln(w, "  └─────────────────────────────────────────────────────┘")
	critCats := map[string]bool{"SECRET": true, "SOURCE_MAP": true, "KEY_MGMT": true, "RPC": true}
	printed := 0
	for _, f := range r.Findings {
		if critCats[f.Category] {
			if printed == 0 {
				fmt.Fprintln(w, "\n  Critical Findings:")
			}
			fmt.Fprintf(w, "    [%s] %s = %s\n", f.Category, f.Key, trunc(f.Value, 80))
			if f.Context != "" {
				fmt.Fprintf(w, "      ctx: %s\n", trunc(f.Context, 120))
			}
			printed++
		}
	}
	if mapsExposed > 0 {
		fmt.Fprintln(w, "\n  [!!] EXPOSED SOURCE MAPS — full application source code may be downloadable")
		for _, sm := range r.SourceMaps {
			if sm.StatusCode == 200 {
				fmt.Fprintf(w, "    %s\n", sm.MapURL)
			}
		}
	}
	fmt.Fprintln(w)
}
