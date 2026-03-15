package main

// Finding represents a single extracted intelligence item.
type Finding struct {
	Category string `json:"category"`
	Key      string `json:"key"`
	Value    string `json:"value"`
	Source   string `json:"source"`
	Context  string `json:"context,omitempty"`
}

// SourceMapResult tracks a source map probe result for a chunk.
type SourceMapResult struct {
	ChunkURL     string `json:"chunk_url"`
	MapURL       string `json:"map_url"`
	StatusCode   int    `json:"status_code"`
	HasDirective bool   `json:"has_directive"`
}

// Report is the top-level JSON output structure.
type Report struct {
	Target      string            `json:"target"`
	Timestamp   string            `json:"timestamp"`
	ChunksFound int               `json:"chunks_found"`
	ChunkURLs   []string          `json:"chunk_urls"`
	Findings    []Finding         `json:"findings"`
	SourceMaps  []SourceMapResult `json:"source_maps"`
	Summary     map[string]int    `json:"summary"`
}
