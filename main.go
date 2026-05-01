package main

import (
	"bufio"
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

// opts holds parsed CLI flags so they can be threaded through helpers.
type opts struct {
	outputFile       string
	workers          int
	timeout          int
	userAgent        string
	checkMaps        bool
	insecure         bool
	verbose          bool
	depth            int
	rscProbe         bool
	renderMode       string
	renderTimeout    time.Duration
	maxRenderRetries int
}

func main() {
	outputFile := flag.String("o", "", "Output JSON file (default: stdout only)")
	workers := flag.Int("w", 10, "Concurrent chunk download workers")
	timeout := flag.Int("t", 30, "HTTP timeout in seconds")
	userAgent := flag.String("ua", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "User-Agent")
	checkMaps := flag.Bool("maps", true, "Probe for source map availability")
	insecure := flag.Bool("k", false, "Skip TLS certificate verification")
	verbose := flag.Bool("v", false, "Verbose output to stderr")

	depth := flag.Int("depth", 1, "Recursive chunk discovery depth (1-3)")
	rscProbe := flag.Bool("rsc", true, "Extract React Server Component payloads and probe routes for RSC flight data")
	renderMode := flag.String("render", "auto", "Rendering mode for HTML fetch: auto|never|always")
	renderTimeoutMs := flag.Int("render-timeout-ms", 15000, "Headless render timeout in milliseconds")
	maxRenderRetries := flag.Int("max-render-retries", 1, "Max headless retries when render mode is auto")
	flag.Parse()

	if *depth < 1 {
		*depth = 1
	} else if *depth > 3 {
		*depth = 3
	}

	if *renderMode != "auto" && *renderMode != "never" && *renderMode != "always" {
		fmt.Fprintln(os.Stderr, "[!] Invalid -render value. Use: auto|never|always")
		os.Exit(1)
	}
	if *maxRenderRetries < 1 {
		*maxRenderRetries = 1
	}
	if *renderTimeoutMs < 1000 {
		*renderTimeoutMs = 1000
	}

	o := opts{
		outputFile:       *outputFile,
		workers:          *workers,
		timeout:          *timeout,
		userAgent:        *userAgent,
		checkMaps:        *checkMaps,
		insecure:         *insecure,
		verbose:          *verbose,
		depth:            *depth,
		rscProbe:         *rscProbe,
		renderMode:       *renderMode,
		renderTimeout:    time.Duration(*renderTimeoutMs) * time.Millisecond,
		maxRenderRetries: *maxRenderRetries,
	}

	// Collect targets: positional args first, then stdin if piped.
	targets := flag.Args()
	if len(targets) == 0 {
		stdinTargets := readStdin()
		if len(stdinTargets) > 0 {
			targets = stdinTargets
		}
	}

	if len(targets) == 0 {
		fmt.Fprintln(os.Stderr, "jsdump — JS bundle intelligence extractor\n\nUsage: jsdump [options] <url|path>\n       echo <url|path> | jsdump [options]\n       cat targets.txt | jsdump [options]\n\nOptions:")
		flag.PrintDefaults()
		fmt.Fprintln(os.Stderr, "\nExamples:\n  jsdump https://app.example.com\n  jsdump https://app.example.com -o findings.json -maps -v\n  echo https://app.example.com | jsdump\n  cat urls.txt | jsdump -v\n  jsdump ./build/\n  jsdump bundle.js\n  find . -name '*.js' | jsdump\n  jsdump /path/to/project/dist -v")
		os.Exit(1)
	}

	// Single target — original behavior (full JSON to stdout + optional -o file).
	if len(targets) == 1 {
		report := processTarget(targets[0], o)
		emitReport(report, o)
		return
	}

	// Multiple targets — one JSON object per line (NDJSON) to stdout.
	// If -o is set, write a merged multi-target report to the file.
	var allReports []Report
	for i, t := range targets {
		if o.verbose {
			fmt.Fprintf(os.Stderr, "\n[*] —— Target %d/%d: %s ——\n", i+1, len(targets), t)
		}
		report := processTarget(t, o)
		allReports = append(allReports, report)
		line, _ := json.Marshal(toOutput(report))
		fmt.Println(string(line))
	}

	// Write merged report to file if -o was given.
	if o.outputFile != "" {
		merged := mergeReports(allReports)
		out, _ := json.MarshalIndent(toOutput(merged), "", "  ")
		if err := os.WriteFile(o.outputFile, out, 0644); err != nil {
			fmt.Fprintf(os.Stderr, "[!] Write error: %v\n", err)
		} else if o.verbose {
			fmt.Fprintf(os.Stderr, "[+] Merged report (%d targets) written to %s\n", len(allReports), o.outputFile)
		}
	}
}

// readStdin reads non-empty, non-comment lines from stdin when it's piped (not a terminal).
func readStdin() []string {
	info, err := os.Stdin.Stat()
	if err != nil {
		return nil
	}
	// Only read if stdin is a pipe or regular file, not a terminal.
	if (info.Mode() & os.ModeCharDevice) != 0 {
		return nil
	}
	var lines []string
	sc := bufio.NewScanner(os.Stdin)
	sc.Buffer(make([]byte, 0, 1024*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line != "" && !strings.HasPrefix(line, "#") {
			lines = append(lines, line)
		}
	}
	return lines
}

// processTarget handles a single URL or local path and returns a Report.
func processTarget(targetURL string, o opts) Report {
	// Local file/directory mode
	if isLocalPath(targetURL) {
		return runLocalReport(targetURL, o.verbose)
	}
	return processRemoteTarget(targetURL, o)
}

// processRemoteTarget fetches a remote URL, discovers JS chunks, and extracts findings.
func processRemoteTarget(targetURL string, o opts) Report {
	client := newClient(o.timeout, o.workers, o.insecure)
	pats := buildPatterns()
	report := Report{Target: targetURL, Timestamp: time.Now().UTC().Format(time.RFC3339)}
	vlog := func(f string, a ...interface{}) {
		if o.verbose {
			fmt.Fprintf(os.Stderr, f, a...)
		}
	}
	vlog("[*] Fetching %s\n", targetURL)
	htmlBody, status, err := fetchWithRenderFallback(client, targetURL, o)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[!] %s: %v\n", targetURL, err)
		os.Exit(1)
	}
	vlog("[+] HTTP %d — %d bytes\n", status, len(htmlBody))

	report.Findings = append(report.Findings, extractFindings(htmlBody, targetURL, pats)...)

	// RSC Phase 1: Extract inline RSC payloads from initial HTML
	isNextAppRouter := reNextAppRouter.MatchString(htmlBody)
	if o.rscProbe && isNextAppRouter {
		vlog("[*] Next.js App Router detected — extracting RSC payloads from HTML\n")
		inlinePayloads := extractRSCPayloads(htmlBody)
		if len(inlinePayloads) > 0 {
			chunks := parseRSCWireFormat(inlinePayloads)
			vlog("[+] Extracted %d RSC chunks from %d inline payloads\n", len(chunks), len(inlinePayloads))
			rscFindings := extractRSCFindings(chunks, targetURL+" [inline-rsc]", pats)
			report.Findings = append(report.Findings, rscFindings...)
			totalSize := 0
			for _, p := range inlinePayloads {
				totalSize += len(p)
			}
			report.RSCPayloads = append(report.RSCPayloads, buildRSCResult("/", "inline", totalSize, len(chunks), rscFindings))
			if len(rscFindings) > 0 {
				vlog("[!!] Found %d findings in inline RSC payloads — server data leaked to client\n", len(rscFindings))
			}
		}
	}

	baseURL, _ := url.Parse(targetURL)
	allChunksSeen := make(map[string]bool)
	var allChunks []string
	chunkBodies := make(map[string]string)
	currentHTML := htmlBody
	for d := 0; d < o.depth; d++ {
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
			sem       = make(chan struct{}, o.workers)
			nextHTML  strings.Builder
			processed int32
		)
		for _, chunkURL := range toProcess {
			wg.Add(1)
			sem <- struct{}{}
			go func(u string) {
				defer wg.Done()
				defer func() { <-sem }()
				body, st, ferr := fetch(client, u, o.userAgent)
				if ferr != nil || st < 200 || st >= 400 {
					vlog("[!] %d %s\n", st, trunc(u, 80))
					return
				}
				// Skip finding extraction for public CDN libraries — they contain
				// author emails, license URLs, and other noise that isn't target intel.
				var findings []Finding
				if !isPublicCDN(u) {
					findings = extractFindings(body, u, pats)
				}
				smDirMatches := reSourceMap.FindAllStringSubmatch(body, -1)
				var smResults []SourceMapResult
				if len(smDirMatches) > 0 {
					for _, smm := range smDirMatches {
						smr, f := probeSourceMap(client, u, resolveURL(u, smm[1]), true, o.checkMaps, o.userAgent)
						smResults = append(smResults, smr)
						if f != nil {
							findings = append(findings, *f)
						}
					}
				} else {
					smr, f := probeSourceMap(client, u, u+".map", false, o.checkMaps, o.userAgent)
					smResults = append(smResults, smr)
					if f != nil {
						findings = append(findings, *f)
					}
				}
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
				if strings.Contains(u, "buildManifest") || strings.Contains(u, "Manifest") || strings.Contains(u, "layout") || strings.Contains(u, "app-pages") {
					chunkBodies[u] = body
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

	// RSC Phase 2: Discover App Router routes and probe for RSC flight data
	if o.rscProbe && isNextAppRouter {
		routes := discoverAppRoutes(htmlBody, allChunks, chunkBodies)
		if len(routes) > 0 {
			vlog("[*] Discovered %d App Router routes — probing for RSC flight data\n", len(routes))
			var (
				mu  sync.Mutex
				wg  sync.WaitGroup
				sem = make(chan struct{}, o.workers)
			)
			for _, route := range routes {
				wg.Add(1)
				sem <- struct{}{}
				go func(r string) {
					defer wg.Done()
					defer func() { <-sem }()
					body, st, ferr := fetchRSCFlight(client, baseURL, r, o.userAgent)
					if ferr != nil || st != 200 || body == "" {
						return
					}
					vlog("[+] RSC flight %s — %d bytes\n", r, len(body))
					payloads := []string{body}
					chunks := parseRSCWireFormat(payloads)
					rscFindings := extractRSCFindings(chunks, baseURL.String()+r+" [rsc-flight]", pats)
					stdFindings := extractFindings(body, baseURL.String()+r+" [rsc-flight]", pats)
					mu.Lock()
					report.Findings = append(report.Findings, rscFindings...)
					report.Findings = append(report.Findings, stdFindings...)
					report.RSCPayloads = append(report.RSCPayloads, buildRSCResult(r, "flight", len(body), len(chunks), rscFindings))
					mu.Unlock()
					if len(rscFindings) > 0 {
						vlog("[!!] RSC flight %s — %d leaked findings\n", r, len(rscFindings))
					}
				}(route)
			}
			wg.Wait()
		}
	}

	report.ChunkURLs = allChunks
	report.ChunksFound = len(allChunks)
	report.Findings = dedup(report.Findings)
	return report
}

// emitReport outputs a single report to stdout (pretty-printed) and optionally to -o file.
func emitReport(report Report, o opts) {
	out, _ := json.MarshalIndent(toOutput(report), "", "  ")
	if o.outputFile != "" {
		if err := os.WriteFile(o.outputFile, out, 0644); err != nil {
			fmt.Fprintf(os.Stderr, "[!] Write error: %v\n", err)
		} else if o.verbose {
			fmt.Fprintf(os.Stderr, "[+] Report written to %s\n", o.outputFile)
		}
	}
	fmt.Println(string(out))
}

// mergeReports combines multiple per-target reports into a single report.
func mergeReports(reports []Report) Report {
	if len(reports) == 0 {
		return Report{}
	}
	if len(reports) == 1 {
		return reports[0]
	}
	var targets []string
	merged := Report{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	for _, r := range reports {
		targets = append(targets, r.Target)
		merged.ChunkURLs = append(merged.ChunkURLs, r.ChunkURLs...)
		merged.Findings = append(merged.Findings, r.Findings...)
		merged.SourceMaps = append(merged.SourceMaps, r.SourceMaps...)
		merged.RSCPayloads = append(merged.RSCPayloads, r.RSCPayloads...)
		merged.ChunksFound += r.ChunksFound
	}
	merged.Target = strings.Join(targets, ", ")
	merged.Findings = dedup(merged.Findings)
	return merged
}
