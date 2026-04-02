package main

import (
	"bytes"
	"encoding/json"
)

type Finding struct {
	Category string `json:"category"`
	Key      string `json:"key"`
	Value    string `json:"value"`
	Source   string `json:"source"`
	Context  string `json:"context,omitempty"`
}

type SourceMapResult struct {
	ChunkURL     string `json:"chunk_url"`
	MapURL       string `json:"map_url"`
	StatusCode   int    `json:"status_code"`
	HasDirective bool   `json:"has_directive"`
}

// Report is the internal representation used during scanning.
type Report struct {
	Target      string
	Timestamp   string
	ChunksFound int
	ChunkURLs   []string
	Findings    []Finding
	SourceMaps  []SourceMapResult
	RSCPayloads []RSCResult
}

// Summary provides aggregate stats about the scan results.
type Summary struct {
	TotalFindings    int            `json:"total_findings"`
	Categories       map[string]int `json:"categories"`
	UniqueKeys       int            `json:"unique_keys"`
	SourceMapsExposed int           `json:"source_maps_exposed"`
	RSCLeaks         int            `json:"rsc_leaks"`
	ChunksScanned    int            `json:"chunks_scanned"`
}

// OutputReport is the JSON-serialized structure with categories as top-level keys.
type OutputReport struct {
	Target      string               `json:"target"`
	Timestamp   string               `json:"timestamp"`
	ChunksFound int                  `json:"chunks_found"`
	Findings    OrderedFindings      `json:"findings"`
	SourceMaps  []SourceMapResult    `json:"source_maps,omitempty"`
	RSCPayloads []RSCResult          `json:"rsc_payloads,omitempty"`
	ChunkURLs   []string             `json:"chunk_urls,omitempty"`
	Summary     Summary              `json:"summary"`
}

// OrderedFindings preserves category key ordering in JSON output.
type OrderedFindings struct {
	Keys   []string
	Groups map[string][]Finding
}

func (o OrderedFindings) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	first := true
	for _, k := range o.Keys {
		findings, ok := o.Groups[k]
		if !ok || len(findings) == 0 {
			continue
		}
		if !first {
			buf.WriteByte(',')
		}
		first = false
		key, _ := json.Marshal(k)
		val, _ := json.Marshal(findings)
		buf.Write(key)
		buf.WriteByte(':')
		buf.Write(val)
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}
