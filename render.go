package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/playwright-community/playwright-go"
)

func needsJSRender(status int, body string) bool {
	if status == 403 || status == 429 || status == 503 {
		return true
	}
	trimmed := strings.TrimSpace(body)
	if trimmed == "" {
		return true
	}
	lower := strings.ToLower(trimmed)
	if len(trimmed) < 700 && strings.Count(lower, "<script") >= 2 && strings.Count(lower, "<a ")+strings.Count(lower, "<p") < 2 {
		return true
	}
	if strings.Contains(lower, "<noscript") && strings.Contains(lower, "enable javascript") {
		return true
	}
	return false
}

func fetchWithRenderFallback(client *HTTPClient, targetURL string, o opts) (string, int, error) {
	body, status, err := fetch(client, targetURL, o.userAgent)
	if err != nil {
		return "", 0, err
	}

	switch o.renderMode {
	case "never":
		return body, status, nil
	case "always":
		return fetchWithPlaywright(targetURL, o)
	default: // auto
		if needsJSRender(status, body) {
			for i := 0; i < o.maxRenderRetries; i++ {
				rb, rs, rerr := fetchWithPlaywright(targetURL, o)
				if rerr == nil && strings.TrimSpace(rb) != "" {
					return rb, rs, nil
				}
			}
		}
		return body, status, nil
	}
}

func fetchWithPlaywright(targetURL string, o opts) (string, int, error) {
	if err := playwright.Install(); err != nil {
		return "", 0, err
	}
	pw, err := playwright.Run()
	if err != nil {
		return "", 0, err
	}
	defer pw.Stop()

	browser, err := pw.Chromium.Launch(playwright.BrowserTypeLaunchOptions{Headless: playwright.Bool(true)})
	if err != nil {
		return "", 0, err
	}
	defer browser.Close()

	stateDir := filepath.Join(os.TempDir(), "jsdump-render-state")
	_ = os.MkdirAll(stateDir, 0o755)
	stateFile := filepath.Join(stateDir, safeStateName(targetURL)+".json")

	ctxOpts := playwright.BrowserNewContextOptions{
		UserAgent: playwright.String(o.userAgent),
	}
	if _, err := os.Stat(stateFile); err == nil {
		ctxOpts.StorageStatePath = playwright.String(stateFile)
	}
	ctx, err := browser.NewContext(ctxOpts)
	if err != nil {
		return "", 0, err
	}
	defer ctx.Close()

	page, err := ctx.NewPage()
	if err != nil {
		return "", 0, err
	}

	c, cancel := context.WithTimeout(context.Background(), o.renderTimeout)
	defer cancel()
	resp, err := page.Goto(targetURL, playwright.PageGotoOptions{WaitUntil: playwright.WaitUntilStateDomcontentloaded})
	if err != nil {
		return "", 0, err
	}
	select {
	case <-c.Done():
	default:
		_ = page.WaitForLoadState(playwright.PageWaitForLoadStateOptions{State: playwright.LoadStateNetworkidle, Timeout: playwright.Float(float64(o.renderTimeout.Milliseconds()))})
	}

	html, err := page.Content()
	if err != nil {
		return "", 0, err
	}
	_, _ = ctx.StorageState(stateFile)

	status := 200
	if resp != nil {
		status = resp.Status()
	}
	return html, status, nil
}

func safeStateName(u string) string {
	r := strings.NewReplacer(":", "_", "/", "_", "?", "_", "&", "_", "=", "_", ".", "_")
	return r.Replace(u)
}
