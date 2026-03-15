package main

import (
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"time"
)

func newClient(timeoutSec, workers int, insecure bool) *http.Client {
	return &http.Client{
		Timeout: time.Duration(timeoutSec) * time.Second,
		Transport: &http.Transport{
			TLSClientConfig:     &tls.Config{InsecureSkipVerify: insecure},
			MaxIdleConnsPerHost: workers,
			MaxConnsPerHost:     workers * 2,
			IdleConnTimeout:     90 * time.Second,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
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
	req.Header.Set("Accept-Encoding", "identity") // no compression — we want raw text

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

func probeStatus(client *http.Client, targetURL, userAgent string) int {
	req, _ := http.NewRequest("HEAD", targetURL, nil)
	if req == nil {
		return -1
	}
	req.Header.Set("User-Agent", userAgent)
	resp, err := client.Do(req)
	if err != nil {
		// fallback to GET
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

// probeSourceMap checks a source map URL and returns the result plus an optional finding.
func probeSourceMap(client *http.Client, chunkURL, mapURL string, hasDirective, check bool, userAgent string) (SourceMapResult, *Finding) {
	smr := SourceMapResult{ChunkURL: chunkURL, MapURL: mapURL, HasDirective: hasDirective, StatusCode: -1}
	if !check {
		return smr, nil
	}
	smr.StatusCode = probeStatus(client, mapURL, userAgent)
	if smr.StatusCode != 200 {
		return smr, nil
	}
	ctx := "Source map publicly accessible (HTTP 200)"
	if !hasDirective {
		ctx = "No directive, but .map URL accessible (HTTP 200)"
	}
	return smr, &Finding{
		Category: "SOURCE_MAP", Key: "exposed_source_map",
		Value: mapURL, Source: chunkURL, Context: ctx,
	}
}
