package main

import "testing"

func TestLooksLikeSourceMap(t *testing.T) {
	tests := []struct {
		name   string
		body   string
		ct     string
		expect bool
	}{
		{"valid source map", `{"version":3,"sources":["app.ts"],"mappings":"AAAA"}`, "application/json", true},
		{"valid with whitespace", `  {"version":3,"mappings":"AAAA","sources":[]}`, "", true},
		{"html error page", `<!DOCTYPE html><html><body>404</body></html>`, "text/html", false},
		{"html lowercase", `<!doctype html><html>Not Found</html>`, "text/html", false},
		{"cloudflare challenge", `<html><head><title>Just a moment...</title></head>`, "text/html", false},
		{"empty body", "", "", false},
		{"plain text error", `Not Found`, "text/plain", false},
		{"json but not sourcemap", `{"error":"not found","code":404}`, "application/json", false},
		{"json with version but no mappings", `{"version":1,"data":[]}`, "application/json", false},
		{"partial source map (version+sources)", `{"version":3,"sources":["a.js"],"names":[]}`, "", true},
		{"BOM prefix", "\xEF\xBB\xBF" + `{"version":3,"mappings":"A","sources":[]}`, "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := looksLikeSourceMap([]byte(tt.body), tt.ct)
			if got != tt.expect {
				t.Errorf("looksLikeSourceMap(%q) = %v, want %v", tt.name, got, tt.expect)
			}
		})
	}
}
