package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// scannable file extensions for local mode
var scanExts = map[string]bool{
	".js": true, ".mjs": true, ".cjs": true, ".jsx": true,
	".ts": true, ".tsx": true,
	".html": true, ".htm": true,
	".json": true, ".jsonc": true,
	".vue": true, ".svelte": true,
	".map": true,
	".env": true,
	".yml": true, ".yaml": true,
	".toml": true,
	".xml": true,
	".conf": true, ".cfg": true, ".ini": true,
	".sh": true, ".bash": true,
	".py": true, ".rb": true, ".go": true, ".rs": true, ".java": true,
	".php": true, ".cs": true,
	".md": true, ".txt": true, ".log": true,
	".sql": true,
	".tf": true, ".tfvars": true,
	".dockerfile": true,
	".properties": true,
}

// directories to always skip
var skipDirs = map[string]bool{
	"node_modules": true, ".git": true, ".svn": true, ".hg": true,
	"__pycache__": true, ".venv": true, "venv": true,
	".next": true, ".nuxt": true,
	"vendor": true, "target": true,
	".cache": true, ".turbo": true,
}

// isLocalPath returns true when the target is a local file or directory rather than a URL.
func isLocalPath(target string) bool {
	if strings.HasPrefix(target, "http://") || strings.HasPrefix(target, "https://") {
		return false
	}
	_, err := os.Stat(target)
	return err == nil
}

// runLocalReport scans a local file or directory and returns a Report.
func runLocalReport(target string, verbose bool) Report {
	pats := buildPatterns()
	report := Report{
		Target:    target,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	vlog := func(f string, a ...interface{}) {
		if verbose {
			fmt.Fprintf(os.Stderr, f, a...)
		}
	}

	info, err := os.Stat(target)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[!] Cannot stat %s: %v\n", target, err)
		return report
	}

	var files []string
	if info.IsDir() {
		vlog("[*] Scanning directory %s\n", target)
		filepath.WalkDir(target, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				if skipDirs[d.Name()] {
					return filepath.SkipDir
				}
				return nil
			}
			// check extension
			ext := strings.ToLower(filepath.Ext(d.Name()))
			// also match dotfiles like .env, Dockerfile, etc.
			base := strings.ToLower(d.Name())
			if scanExts[ext] || base == ".env" || base == "dockerfile" || base == ".env.local" || base == ".env.production" || base == ".env.development" || strings.HasPrefix(base, ".env.") {
				// skip huge files (>10MB)
				if info, err := d.Info(); err == nil && info.Size() < 10*1024*1024 {
					files = append(files, path)
				}
			}
			return nil
		})
	} else {
		files = []string{target}
	}

	vlog("[+] Found %d files to scan\n", len(files))

	// scan files concurrently
	var (
		mu        sync.Mutex
		wg        sync.WaitGroup
		sem       = make(chan struct{}, 10)
		processed int32
	)

	for _, path := range files {
		wg.Add(1)
		sem <- struct{}{}
		go func(p string) {
			defer wg.Done()
			defer func() { <-sem }()

			content, err := os.ReadFile(p)
			if err != nil {
				return
			}
			// skip binary files (check first 512 bytes for null bytes)
			check := content
			if len(check) > 512 {
				check = check[:512]
			}
			for _, b := range check {
				if b == 0 {
					return
				}
			}

			findings := extractFindings(string(content), p, pats)
			if len(findings) > 0 {
				mu.Lock()
				report.Findings = append(report.Findings, findings...)
				mu.Unlock()
			}
			n := atomic.AddInt32(&processed, 1)
			if verbose && n%100 == 0 {
				fmt.Fprintf(os.Stderr, "[+] %d/%d files scanned\n", n, len(files))
			}
		}(path)
	}
	wg.Wait()

	report.ChunksFound = len(files)
	report.ChunkURLs = files
	report.Findings = dedup(report.Findings)
	return report
}
