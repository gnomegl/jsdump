package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

func main() {
	targetURL := flag.String("url", "", "Target URL to crawl")
	outputFile := flag.String("o", "", "Output JSON file (default: stdout only)")
	workers := flag.Int("w", 10, "Concurrent chunk download workers")
	timeout := flag.Int("t", 30, "HTTP timeout in seconds")
	userAgent := flag.String("ua", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "User-Agent")
	checkMaps := flag.Bool("maps", true, "Probe for source map availability")
	insecure := flag.Bool("k", false, "Skip TLS certificate verification")
	verbose := flag.Bool("v", false, "Verbose output to stderr")
	jsonOnly := flag.Bool("json", false, "JSON output only (suppress summary)")
	depth := flag.Int("depth", 1, "Recursive chunk discovery depth (1-3)")
	flag.Parse()
	if *targetURL == "" {
		fmt.Fprintln(os.Stderr, "jsdump — JS bundle intelligence extractor\n\nUsage: jsdump -url <target> [options]\n\nOptions:")
		flag.PrintDefaults()
		fmt.Fprintln(os.Stderr, "\nExamples:\n  jsdump -url https://app.example.com\n  jsdump -url https://app.example.com -o findings.json -maps -v\n  jsdump -url https://app.example.com -json | jq '.findings[] | select(.category==\"SECRET\")'")
		os.Exit(1)
	}
	if *depth < 1 {
		*depth = 1
	} else if *depth > 3 {
		*depth = 3
	}
	client := newClient(*timeout, *workers, *insecure)
	pats := buildPatterns()
	report := Report{Target: *targetURL, Timestamp: time.Now().UTC().Format(time.RFC3339), Summary: make(map[string]int)}
	vlog := func(f string, a ...interface{}) {
		if *verbose {
			fmt.Fprintf(os.Stderr, f, a...)
		}
	}
	vlog("[*] Fetching %s\n", *targetURL)
	htmlBody, status, err := fetch(client, *targetURL, *userAgent)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[!] Failed to fetch target: %v\n", err)
		os.Exit(1)
	}
	vlog("[+] HTTP %d — %d bytes\n", status, len(htmlBody))
	if status == 429 || status == 403 || strings.Contains(htmlBody, "Vercel Security Checkpoint") || strings.Contains(htmlBody, "cf-challenge") || strings.Contains(htmlBody, "challenge-platform") {
		fmt.Fprintf(os.Stderr, "[!] Bot protection detected (HTTP %d). The initial HTML may be a challenge page.\n    Tip: Fetch the rendered HTML in a real browser, save it, then use:\n         curl -b cookies.txt <url> | jsdump -url <url>\n    Continuing anyway — JS chunks may still be fetchable directly.\n\n", status)
	}
	report.Findings = append(report.Findings, extractFindings(htmlBody, *targetURL, pats)...)
	baseURL, _ := url.Parse(*targetURL)
	allChunksSeen := make(map[string]bool)
	var allChunks []string
	currentHTML := htmlBody
	for d := 0; d < *depth; d++ {
		var toProcess []string
		for _, c := range discoverChunks(currentHTML, baseURL) {
			if !allChunksSeen[c] {
				allChunksSeen[c] = true
				allChunks = append(allChunks, c)
				toProcess = append(toProcess, c)
			}
		}
		if len(toProcess) == 0 {
			break
		}
		vlog("[+] Depth %d: discovered %d new chunks (%d total)\n", d+1, len(toProcess), len(allChunks))
		var (
			mu        sync.Mutex
			wg        sync.WaitGroup
			sem       = make(chan struct{}, *workers)
			nextHTML  strings.Builder
			processed int32
		)
		for _, chunkURL := range toProcess {
			wg.Add(1)
			sem <- struct{}{}
			go func(u string) {
				defer wg.Done()
				defer func() { <-sem }()
				body, st, err := fetch(client, u, *userAgent)
				if err != nil || st < 200 || st >= 400 {
					vlog("[!] %d %s\n", st, trunc(u, 80))
					return
				}
				findings := extractFindings(body, u, pats)
				smDirMatches := reSourceMap.FindAllStringSubmatch(body, -1)
				var smResults []SourceMapResult
				if len(smDirMatches) > 0 {
					for _, smm := range smDirMatches {
						smr, f := probeSourceMap(client, u, resolveURL(u, smm[1]), true, *checkMaps, *userAgent)
						smResults = append(smResults, smr)
						if f != nil {
							findings = append(findings, *f)
						}
					}
				} else {
					smr, f := probeSourceMap(client, u, u+".map", false, *checkMaps, *userAgent)
					smResults = append(smResults, smr)
					if f != nil {
						findings = append(findings, *f)
					}
				}
				// Wrap manifest-discovered chunks as synthetic <script> tags for next-depth discovery
				var manifestHTML string
				if strings.Contains(u, "buildManifest") || strings.Contains(u, "Manifest") {
					extra := discoverChunksFromBuildManifest(body, baseURL)
					var sb strings.Builder
					sb.WriteString(body)
					for _, e := range extra {
						sb.WriteString(fmt.Sprintf(`<script src="%s"></script>`, e))
					}
					manifestHTML = sb.String()
				}
				mu.Lock()
				report.SourceMaps = append(report.SourceMaps, smResults...)
				report.Findings = append(report.Findings, findings...)
				if manifestHTML != "" {
					nextHTML.WriteString(manifestHTML)
				}
				mu.Unlock()
				n := atomic.AddInt32(&processed, 1)
				vlog("[+] %d/%d %s (%d findings)\n", n, len(toProcess), trunc(u, 60), len(findings))
			}(chunkURL)
		}
		wg.Wait()
		currentHTML = nextHTML.String()
		if currentHTML == "" {
			break
		}
	}
	report.ChunkURLs = allChunks
	report.ChunksFound = len(allChunks)
	report.Findings = dedup(report.Findings)
	for _, f := range report.Findings {
		report.Summary[f.Category]++
	}
	out, _ := json.MarshalIndent(report, "", "  ")
	if *outputFile != "" {
		if err := os.WriteFile(*outputFile, out, 0644); err != nil {
			fmt.Fprintf(os.Stderr, "[!] Write error: %v\n", err)
		} else {
			vlog("[+] Report written to %s\n", *outputFile)
		}
	}
	if !*jsonOnly {
		printSummary(report)
	}
	fmt.Println(string(out))
}
